import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { deriveInitials, deriveTint } from '@sc/shared';
import type {
  CreateProviderProfileInput,
  ProviderPageDto,
  ProviderProfileDto,
  ProviderSlotsResponse,
} from '@sc/shared';
import { PrismaService } from '../prisma/prisma.service';
import { GeoRepository } from '../geo/geo.repository';
import { toProviderListRow } from '../geo/mappers';

/**
 * Candidate slot times offered for a booking, half-hour increments across a
 * full working day (07:00-19:30).
 *
 * This was six fixed times capped at 14:30 — a leftover from the M1 mobile
 * fixtures that nothing ever replaced with real per-provider hours, so no
 * client could ever book anyone for the evening. There is still no
 * structured "opening hours" model on ProviderProfile (`workingHoursLabel`
 * is free text a human reads, not something this can compute from), so this
 * is a wide, generous fixed window rather than each stylist's real hours —
 * genuinely per-provider availability is the correct next step, tracked
 * separately from this fix.
 */
function buildCandidateTimes(): string[] {
  const START_HOUR = 7;
  const END_HOUR = 20;
  const STEP_MINUTES = 30;

  const times: string[] = [];
  for (let minutes = START_HOUR * 60; minutes < END_HOUR * 60; minutes += STEP_MINUTES) {
    const hh = Math.floor(minutes / 60)
      .toString()
      .padStart(2, '0');
    const mm = (minutes % 60).toString().padStart(2, '0');
    times.push(`${hh}:${mm}`);
  }
  return times;
}

const CANDIDATE_TIMES = buildCandidateTimes();

const NON_BLOCKING_STATUSES = ['cancelled', 'declined'] as const;

/** `date` ('yyyy-MM-dd') and `time` ('HH:mm') are Harare-local wall-clock values; Harare is a fixed UTC+2 with no DST. */
function harareSlotToUtc(date: string, time: string): Date {
  return new Date(`${date}T${time}:00+02:00`);
}

@Injectable()
export class ProvidersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geo: GeoRepository,
  ) {}

  /**
   * Home's "Available now" list — genuinely available now: only providers
   * whose `acceptingBookings` is on. Before this the list was a radius filter
   * and a distance sort with no availability concept at all, under a heading
   * and a live indicator that both claimed otherwise.
   *
   * Ranked by relevance rather than raw distance, and paginated: the previous
   * version returned every provider inside the radius on every load and every
   * 60-second poll, which is a whole catalogue over a metered connection.
   */
  async listAvailable(params: {
    lat: number;
    lng: number;
    radiusKm?: number | null;
    limit: number;
    offset: number;
  }): Promise<ProviderPageDto> {
    return this.page({ ...params, onlyAcceptingBookings: true });
  }

  /**
   * Free-text provider search, scoped to the same maximum distance as the
   * rest of the tab — a search that silently ignored the radius filter would
   * contradict the list right above it.
   *
   * Deliberately does NOT filter on availability: someone searching by name
   * is usually looking for a specific stylist they already know, and hiding
   * them because they are off today is worse than showing them as unavailable.
   */
  async search(params: {
    query: string;
    lat: number;
    lng: number;
    radiusKm?: number | null;
    limit: number;
    offset: number;
  }): Promise<ProviderPageDto> {
    const { query, ...rest } = params;
    return this.page({ ...rest, searchTerm: query });
  }

  /**
   * Fetches one row more than asked for: if it comes back, there is another
   * page. Cheaper and race-free compared with a second COUNT query, which
   * could disagree with the page it is meant to describe.
   */
  private async page(options: {
    lat: number;
    lng: number;
    radiusKm?: number | null;
    limit: number;
    offset: number;
    searchTerm?: string;
    onlyAcceptingBookings?: boolean;
  }): Promise<ProviderPageDto> {
    const { limit, offset } = options;
    const rows = await this.geo.findProvidersWithinRadius({
      ...options,
      sort: 'relevance',
      limit: limit + 1,
      offset,
    });

    const hasMore = rows.length > limit;
    return {
      items: rows.slice(0, limit).map(toProviderListRow),
      nextOffset: hasMore ? offset + limit : null,
    };
  }

  async getById(id: string, lat: number, lng: number): Promise<ProviderProfileDto> {
    const row = await this.geo.findProviderById(id, lat, lng);
    if (!row) {
      throw new NotFoundException('Provider not found');
    }

    const provider = await this.prisma.providerProfile.findUniqueOrThrow({
      where: { id },
      include: { services: true },
    });

    const reviews = await this.prisma.review.findMany({
      where: { rateeId: provider.userId },
      include: { rater: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return {
      id: row.id,
      displayName: row.displayName,
      tint: row.tint,
      initials: row.initials,
      verified: row.verified,
      categoryName: row.categoryName,
      areaName: row.areaName,
      distanceKm: row.distanceKm,
      ratingAvg: row.ratingAvg,
      completedCount: row.completedCount,
      yearsExperience: provider.yearsExperience,
      portfolioImageUrls: provider.portfolioImageUrls,
      priceDisplay: provider.priceDisplay,
      services: provider.services.map((s) => ({
        id: s.id,
        name: s.name,
        durationMinutes: s.durationMinutes,
        priceUsdCents: s.priceUsdCents,
      })),
      ...(provider.fromPriceUsdCents !== null
        ? { fromPriceUsdCents: provider.fromPriceUsdCents }
        : {}),
      reviews: reviews.map((r) => ({
        id: r.id,
        authorName: r.rater.displayName,
        rating: r.rating,
        text: r.text ?? '',
      })),
      workingHoursLabel: provider.workingHoursLabel,
    };
  }

  async getSlots(providerId: string, date: string): Promise<ProviderSlotsResponse> {
    const candidates = CANDIDATE_TIMES.map((time) => ({
      time,
      instant: harareSlotToUtc(date, time),
    }));

    const bookings = await this.prisma.booking.findMany({
      where: {
        providerId,
        startsAt: { in: candidates.map((c) => c.instant) },
        status: { notIn: [...NON_BLOCKING_STATUSES] },
      },
      select: { startsAt: true },
    });
    const takenTimestamps = new Set(bookings.map((b) => b.startsAt.getTime()));

    return {
      date,
      slots: candidates.map(({ time, instant }) => ({
        time,
        available: !takenTimestamps.has(instant.getTime()),
      })),
    };
  }

  /**
   * The other side of the "you don't have a stylist page yet" message the
   * role switcher shows — before this there was no endpoint that could ever
   * make that message stop being true. Verification (ID + selfie) is a
   * separate, later step; this creates a bookable page with the minimum a
   * client can act on: a category, an area, honest hours, and at least one
   * priced service.
   */
  async createMyProfile(userId: string, input: CreateProviderProfileInput): Promise<{ id: string }> {
    const existing = await this.prisma.providerProfile.findUnique({ where: { userId } });
    if (existing) {
      throw new BadRequestException('You already have a stylist page');
    }

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    // Single-city M1 build (plan §5) — there is nowhere else to assign one from yet.
    const city = await this.prisma.city.findFirstOrThrow();

    const profile = await this.prisma.providerProfile.create({
      data: {
        userId,
        displayName: user.displayName,
        tint: deriveTint(user.displayName),
        initials: deriveInitials(user.displayName),
        categoryId: input.categoryId,
        areaName: input.areaName,
        latitude: input.lat,
        longitude: input.lng,
        cityId: city.id,
        yearsExperience: input.yearsExperience,
        workingHoursLabel: input.workingHoursLabel,
        services: { create: input.services },
      },
    });

    return { id: profile.id };
  }
}

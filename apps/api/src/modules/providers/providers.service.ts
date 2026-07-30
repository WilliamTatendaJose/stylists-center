import { Injectable, NotFoundException } from '@nestjs/common';
import type { ProviderListRowDto, ProviderProfileDto, ProviderSlotsResponse } from '@sc/shared';
import { PrismaService } from '../prisma/prisma.service';
import { GeoRepository } from '../geo/geo.repository';
import { toProviderListRow } from '../geo/mappers';

/** Same fixed candidate grid as the M1 mobile fixtures (getSlotsForProvider). */
const CANDIDATE_TIMES = ['08:00', '09:30', '10:00', '11:30', '13:00', '14:30'];

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

  /** Home's "Available now" list — every provider, nearest first, no radius cutoff (plan §6 endpoint list). */
  async listAvailable(lat: number, lng: number): Promise<ProviderListRowDto[]> {
    const rows = await this.geo.findProvidersWithinRadius(lat, lng, null);
    return rows.map(toProviderListRow);
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
}

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  bookingAmounts,
  canProviderRespond,
  canReportNonPayment,
  deriveInitials,
  deriveTint,
  formatBookingWhen,
  normalizePhone,
  type BookingStatus,
  type CreateProviderProductInput,
  type UpdateProviderProductInput,
  type CreateProviderServiceInput,
  providerOwesCompletion,
  type ProviderAvailabilityDto,
  type ProviderBookingRowDto,
  type ProviderEarningsDto,
  type ProviderEarningsEntryDto,
  type ProviderJobsDto,
  type ProviderOfferDto,
  type ProviderManagementProfileDto,
  type ProductCategory,
  type ProviderProductDto,
  type ServiceDto,
  type UpdateProviderProfileInput,
  type UpdateProviderServiceInput,
  type ProviderCalendarDto,
  type UpdateWeeklyHoursInput,
  type CreateProviderTimeOffInput,
  orderAmountDueUsdCents,
  type ProviderEarningsJobDto,
} from '@sc/shared';
import { Optional } from '@nestjs/common';
import { SettingsService, settingsFor } from '../settings/settings.service';
import { Prisma } from '../../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { SocketEmitterService } from '../realtime/socket-emitter.service';
import { PushService } from '../notifications/push.service';
import { MatchingService } from '../matching/matching.service';
import { toBookingRowDto } from '../bookings/mappers';
import { BookingLifecycleService } from '../bookings/booking-lifecycle.service';
import { FeeLedgerService } from '../fees/fee-ledger.service';
import { harareMonthKey, harareMonthStart } from '../fees/fee-periods';
import { isWithinWeeklyHours, readWeeklyHours } from '../providers/calendar-policy';
import { ReminderService } from '../notifications/reminder.service';

/** Statuses a stylist still has something to do about, plus recent history (including jobs that did not complete) for context. */
const VISIBLE_STATUSES = ['awaiting_provider', 'confirmed', 'completed', 'incomplete'] as const;

/**
 * What a client is told when a stylist moves their booking.
 *
 * `awaiting_provider` is absent on purpose: that state is the client's own
 * request being created, so notifying them tells them something they just did.
 * A status with no entry here simply sends nothing, which is why this is a
 * lookup rather than a switch with a default.
 */
const BOOKING_STATUS_NOTIFICATION: Partial<Record<BookingStatus, { title: string }>> = {
  confirmed: { title: 'Booking confirmed' },
  declined: { title: 'Booking declined' },
  cancelled: { title: 'Booking cancelled' },
  completed: { title: 'Booking completed' },
};

@Injectable()
export class ProviderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly socketEmitter: SocketEmitterService,
    private readonly matching: MatchingService,
    private readonly push: PushService,
    private readonly lifecycle: BookingLifecycleService,
    @Optional() private readonly settings?: SettingsService,
    @Optional() private readonly reminders?: ReminderService,
    @Optional() private readonly fees?: FeeLedgerService,
  ) {}

  /** One request for the whole Jobs screen — availability, live offers, and the work itself. */
  async getJobs(providerProfileId: string): Promise<ProviderJobsDto> {
    const [profile, offers, bookings] = await Promise.all([
      this.prisma.providerProfile.findUniqueOrThrow({
        where: { id: providerProfileId },
        select: { acceptingBookings: true },
      }),
      this.listOffers(providerProfileId),
      this.listBookings(providerProfileId),
    ]);

    return { acceptingBookings: profile.acceptingBookings, offers, bookings };
  }

  async getProfile(providerProfileId: string): Promise<ProviderManagementProfileDto> {
    const profile = await this.prisma.providerProfile.findUniqueOrThrow({
      where: { id: providerProfileId },
      include: { services: { orderBy: { createdAt: 'asc' } } },
    });
    return {
      id: profile.id,
      displayName: profile.displayName,
      areaName: profile.areaName,
      workingHoursLabel: profile.workingHoursLabel,
      lat: profile.latitude,
      lng: profile.longitude,
      profileImageUrl: profile.profileImageUrl,
      portfolioImageUrls: profile.portfolioImageUrls,
      paymentPhone: profile.paymentPhone,
      services: profile.services.map(({ id, name, durationMinutes, priceUsdCents, imageUrls }) => ({
        id,
        name,
        durationMinutes,
        priceUsdCents,
        imageUrls,
      })),
    };
  }

  async getCalendar(providerId: string): Promise<ProviderCalendarDto> {
    const [profile, blocks] = await Promise.all([
      this.prisma.providerProfile.findUniqueOrThrow({
        where: { id: providerId },
        select: { weeklyHours: true },
      }),
      this.prisma.providerTimeOff.findMany({
        where: { providerId, endsAt: { gt: new Date() } },
        orderBy: { startsAt: 'asc' },
      }),
    ]);
    return {
      weeklyHours: readWeeklyHours(profile.weeklyHours),
      configured: profile.weeklyHours !== null,
      timeOff: blocks.map((block) => ({
        id: block.id,
        startsAt: block.startsAt.toISOString(),
        endsAt: block.endsAt.toISOString(),
        note: block.note,
      })),
    };
  }

  async updateCalendar(
    providerId: string,
    input: UpdateWeeklyHoursInput,
  ): Promise<ProviderCalendarDto> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${providerId}))`;
      const futureBookings = await tx.booking.findMany({
        where: {
          providerId,
          startsAt: { gt: new Date() },
          status: { notIn: ['cancelled', 'declined'] },
        },
        select: { startsAt: true, endsAt: true },
      });
      if (
        futureBookings.some(
          (booking) => !isWithinWeeklyHours(input.weeklyHours, booking.startsAt, booking.endsAt),
        )
      ) {
        throw new BadRequestException(
          'Existing bookings fall outside these hours. Keep those hours until the bookings are completed or cancelled.',
        );
      }
      await tx.providerProfile.update({
        where: { id: providerId },
        data: { weeklyHours: input.weeklyHours },
      });
    });
    return this.getCalendar(providerId);
  }

  async addTimeOff(
    providerId: string,
    input: CreateProviderTimeOffInput,
  ): Promise<ProviderCalendarDto> {
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    if (startsAt <= new Date() || endsAt.getTime() - startsAt.getTime() > 30 * 24 * 60 * 60_000) {
      throw new BadRequestException('Choose a future time off period of up to 30 days');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${providerId}))`;
      const booking = await tx.booking.findFirst({
        where: {
          providerId,
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt },
          status: { notIn: ['cancelled', 'declined'] },
        },
      });
      if (booking) throw new BadRequestException('A booking already exists during this time');
      await tx.providerTimeOff.create({
        data: { providerId, startsAt, endsAt, note: input.note ?? null },
      });
    });
    return this.getCalendar(providerId);
  }

  async removeTimeOff(providerId: string, id: string): Promise<ProviderCalendarDto> {
    const deleted = await this.prisma.providerTimeOff.deleteMany({ where: { id, providerId } });
    if (!deleted.count) throw new NotFoundException('Time off not found');
    return this.getCalendar(providerId);
  }

  async updateProfile(
    providerProfileId: string,
    input: UpdateProviderProfileInput,
  ): Promise<ProviderManagementProfileDto> {
    const profile = await this.prisma.providerProfile.findUniqueOrThrow({
      where: { id: providerProfileId },
      select: { userId: true },
    });
    const tint = deriveTint(input.displayName);
    const initials = deriveInitials(input.displayName);
    await this.prisma.$transaction([
      this.prisma.providerProfile.update({
        where: { id: providerProfileId },
        data: {
          displayName: input.displayName,
          tint,
          initials,
          areaName: input.areaName,
          workingHoursLabel: input.workingHoursLabel,
          latitude: input.lat,
          longitude: input.lng,
          ...(input.profileImageUrl !== undefined
            ? { profileImageUrl: input.profileImageUrl }
            : {}),
          ...(input.portfolioImageUrls ? { portfolioImageUrls: input.portfolioImageUrls } : {}),
          // Stored in E.164 so every screen formats it the same way.
          ...(input.paymentPhone !== undefined
            ? {
                paymentPhone:
                  input.paymentPhone === null ? null : normalizePhone(input.paymentPhone),
              }
            : {}),
        },
      }),
      this.prisma.user.update({
        where: { id: profile.userId },
        data: { displayName: input.displayName },
      }),
    ]);
    return this.getProfile(providerProfileId);
  }

  async addService(
    providerProfileId: string,
    input: CreateProviderServiceInput,
  ): Promise<ServiceDto> {
    const current = await this.prisma.providerProfile.findUniqueOrThrow({
      where: { id: providerProfileId },
      select: { fromPriceUsdCents: true },
    });
    const [service] = await this.prisma.$transaction([
      this.prisma.service.create({ data: { providerId: providerProfileId, ...input } }),
      this.prisma.providerProfile.update({
        where: { id: providerProfileId },
        data: {
          fromPriceUsdCents: Math.min(
            current.fromPriceUsdCents ?? input.priceUsdCents,
            input.priceUsdCents,
          ),
        },
      }),
    ]);
    return {
      id: service.id,
      name: service.name,
      durationMinutes: service.durationMinutes,
      priceUsdCents: service.priceUsdCents,
      imageUrls: service.imageUrls,
    };
  }

  async updateService(
    serviceId: string,
    providerProfileId: string,
    input: UpdateProviderServiceInput,
  ): Promise<ServiceDto> {
    const existing = await this.prisma.service.findFirst({
      where: { id: serviceId, providerId: providerProfileId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Service not found');

    const service = await this.prisma.service.update({ where: { id: serviceId }, data: input });
    const cheapest = await this.prisma.service.aggregate({
      where: { providerId: providerProfileId },
      _min: { priceUsdCents: true },
    });
    await this.prisma.providerProfile.update({
      where: { id: providerProfileId },
      data: { fromPriceUsdCents: cheapest._min.priceUsdCents },
    });
    return {
      id: service.id,
      name: service.name,
      durationMinutes: service.durationMinutes,
      priceUsdCents: service.priceUsdCents,
      imageUrls: service.imageUrls,
    };
  }

  async getProducts(providerProfileId: string): Promise<ProviderProductDto[]> {
    const products = await this.prisma.product.findMany({
      where: { providerId: providerProfileId, active: true },
      orderBy: { createdAt: 'desc' },
    });
    return products.map(
      ({
        id,
        name,
        category,
        description,
        priceUsdCents,
        stockQty,
        version,
        imageUrls,
        active,
      }) => ({
        id,
        name,
        category: category as ProductCategory,
        description,
        priceUsdCents,
        stockQty,
        version,
        imageUrls,
        active,
      }),
    );
  }

  /**
   * Only an approved vendor may list products. Checked on the vendor record
   * rather than trusting the app to hide the button.
   */
  private async requireApprovedVendor(providerProfileId: string): Promise<void> {
    const vendor = await this.prisma.vendorApplication.findUnique({
      where: { providerId: providerProfileId },
      select: { status: true },
    });
    if (vendor?.status !== 'approved') {
      throw new ForbiddenException('Your shop must be approved before you can list products');
    }
  }

  async createProduct(
    providerProfileId: string,
    input: CreateProviderProductInput,
  ): Promise<ProviderProductDto> {
    await this.requireApprovedVendor(providerProfileId);
    const product = await this.prisma.product.create({
      data: { providerId: providerProfileId, ...input, category: input.category ?? 'other' },
    });
    return { ...product, category: product.category as ProductCategory };
  }

  async updateProduct(
    productId: string,
    providerProfileId: string,
    input: UpdateProviderProductInput,
  ): Promise<ProviderProductDto> {
    await this.requireOwnProduct(productId, providerProfileId);
    const { category, expectedVersion, ...changes } = input;
    const updated = await this.prisma.product.updateMany({
      where: { id: productId, providerId: providerProfileId, version: expectedVersion },
      data: { ...changes, ...(category ? { category } : {}), version: { increment: 1 } },
    });
    if (updated.count === 0) {
      throw new ConflictException(
        'This item changed while you were editing. Reload it and try again.',
      );
    }
    const product = await this.prisma.product.findUniqueOrThrow({ where: { id: productId } });
    return { ...product, category: product.category as ProductCategory };
  }

  async restockProduct(
    productId: string,
    providerProfileId: string,
    quantity: number,
  ): Promise<ProviderProductDto> {
    await this.requireOwnProduct(productId, providerProfileId);
    const product = await this.prisma.product.update({
      where: { id: productId },
      data: { stockQty: { increment: quantity }, version: { increment: 1 }, active: true },
    });
    return { ...product, category: product.category as ProductCategory };
  }

  async deleteProduct(productId: string, providerProfileId: string): Promise<void> {
    await this.requireOwnProduct(productId, providerProfileId);
    await this.prisma.product.update({
      where: { id: productId },
      data: { active: false, version: { increment: 1 } },
    });
  }

  private async listBookings(providerProfileId: string): Promise<ProviderBookingRowDto[]> {
    await this.lifecycle.expireStale({ providerId: providerProfileId });
    const reportHours = await (this.settings ?? settingsFor(this.prisma)).get(
      'nonPaymentReportHours',
    );
    const bookings = await this.prisma.booking.findMany({
      where: { providerId: providerProfileId, status: { in: [...VISIBLE_STATUSES] } },
      include: { client: { include: { providerProfile: true } }, service: true },
      orderBy: { startsAt: 'desc' },
      take: 50,
    });

    return bookings.map((b) => {
      const clientImageUrl = b.client.avatarImageUrl ?? b.client.providerProfile?.profileImageUrl;
      return {
        id: b.id,
        reference: b.reference,
        clientName: b.client.displayName,
        ...(clientImageUrl ? { clientImageUrl } : {}),
        serviceName: b.service.name,
        whenLabel: formatBookingWhen(b.startsAt.toISOString()),
        startsAt: b.startsAt.toISOString(),
        paymentMethod: b.paymentMethod,
        priceUsdCents: b.priceUsdCents,
        serviceFeeUsdCents: b.serviceFeeUsdCents,
        coinsUsed: b.coinsUsed,
        coinsUsdCents: b.coinsUsdCents,
        amountToCollectUsdCents: bookingAmounts(b).amountDueUsdCents,
        status: b.status,
        confirmedByClient: b.confirmedByClient,
        confirmedByProvider: b.confirmedByProvider,
        nonPaymentReportedAt: b.nonPaymentReportedAt?.toISOString() ?? null,
        canConfirm: canProviderRespond(b.status),
        canDecline: canProviderRespond(b.status),
        canConfirmCompletion: providerOwesCompletion({
          paymentMethod: b.paymentMethod,
          status: b.status,
          confirmedByProvider: b.confirmedByProvider,
        }),
        canReportNonPayment: canReportNonPayment(
          {
            paymentMethod: b.paymentMethod,
            status: b.status,
            startsAtIso: b.startsAt.toISOString(),
            alreadyReported: b.nonPaymentReportedAt !== null,
          },
          reportHours,
        ),
      };
    });
  }

  private async listOffers(providerProfileId: string): Promise<ProviderOfferDto[]> {
    const offers = await this.prisma.matchOffer.findMany({
      where: {
        providerId: providerProfileId,
        state: 'offered',
        // An offer past its response deadline is not answerable; showing it
        // would invite a tap that can only fail.
        respondBy: { gt: new Date() },
      },
      include: { matchRequest: { include: { category: true } } },
      orderBy: { respondBy: 'asc' },
    });

    const profile = await this.prisma.providerProfile.findUniqueOrThrow({
      where: { id: providerProfileId },
      select: { latitude: true, longitude: true },
    });

    return offers.map((offer) => ({
      id: offer.id,
      matchId: offer.matchRequestId,
      categoryName: offer.matchRequest.category.name,
      budgetUsdCents: offer.matchRequest.budgetAmountUsdCents,
      quoteUsdCents: offer.quoteUsdCents,
      distanceKm: haversineKm(
        profile.latitude,
        profile.longitude,
        offer.matchRequest.latitude,
        offer.matchRequest.longitude,
      ),
      respondBy: offer.respondBy.toISOString(),
    }));
  }

  /**
   * Accept a booking request. This is the transition nothing could perform —
   * `confirmedByProvider` was read in three places and written in none, so
   * every booking a client made stayed "Awaiting stylist" forever.
   */
  async confirmBooking(bookingId: string, providerProfileId: string): Promise<void> {
    const booking = await this.lifecycle.accept(bookingId, providerProfileId);
    void this.reminders?.scheduleBooking(bookingId, booking.startsAt);
    await this.notifyClient(bookingId, booking.clientId);
  }

  async declineBooking(bookingId: string, providerProfileId: string): Promise<void> {
    const booking = await this.lifecycle.decline(bookingId, providerProfileId);
    // Bookings paid in the app before clients paid directly: declining frees
    // the slot, so any escrow held for it must go back.
    await this.refundIfHeld(bookingId);
    await this.notifyClient(bookingId, booking.clientId);
  }

  /** The stylist's "payment received". The booking completes once the client confirms too. */
  async confirmCompletion(bookingId: string, providerProfileId: string): Promise<void> {
    const before = await this.requireOwnBooking(bookingId, providerProfileId);
    const after = await this.lifecycle.confirm(bookingId, 'provider');
    if (before.confirmedByProvider && before.status === after.status) return;
    await this.notifyClient(bookingId, before.clientId);
  }

  /** The stylist says the client did not pay: no fee for this job, and staff can see the report. */
  async reportNonPayment(
    bookingId: string,
    providerProfileId: string,
    note?: string,
  ): Promise<void> {
    const before = await this.requireOwnBooking(bookingId, providerProfileId);
    await this.lifecycle.reportNonPayment(bookingId, providerProfileId, note);
    if (!before.nonPaymentReportedAt) await this.notifyClient(bookingId, before.clientId);
  }

  async setAvailability(
    providerProfileId: string,
    acceptingBookings: boolean,
  ): Promise<ProviderAvailabilityDto> {
    const updated = await this.prisma.providerProfile.update({
      where: { id: providerProfileId },
      data: { acceptingBookings },
      select: { acceptingBookings: true },
    });
    return updated;
  }

  /**
   * Accept a smart-match offer for real.
   *
   * The only way to accept one was `POST /v1/dev/simulate/accept-offer`,
   * which 404s when NODE_ENV is production — so in a real deployment smart
   * match could never produce a booking at all.
   */
  async acceptOffer(offerId: string, providerProfileId: string) {
    const offer = await this.requireOwnOffer(offerId, providerProfileId);
    return this.matching.acceptOffer(offer.matchRequestId, providerProfileId);
  }

  async declineOffer(offerId: string, providerProfileId: string): Promise<void> {
    const offer = await this.requireOwnOffer(offerId, providerProfileId);
    await this.prisma.matchOffer.update({
      where: { id: offer.id },
      data: { state: 'declined' },
    });
  }

  private async requireOwnOffer(offerId: string, providerProfileId: string) {
    const offer = await this.prisma.matchOffer.findUnique({ where: { id: offerId } });
    if (!offer) throw new NotFoundException('Offer not found');
    if (offer.providerId !== providerProfileId) throw new ForbiddenException();
    if (offer.state !== 'offered') {
      throw new BadRequestException(`This offer is already ${offer.state}`);
    }
    if (offer.respondBy.getTime() < Date.now()) {
      throw new BadRequestException('This offer has expired');
    }
    return offer;
  }

  private async requireOwnBooking(bookingId: string, providerProfileId: string) {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.providerId !== providerProfileId) throw new ForbiddenException();
    return booking;
  }

  private async requireOwnProduct(productId: string, providerProfileId: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (product?.providerId !== providerProfileId) {
      throw new NotFoundException('Marketplace item not found');
    }
    return product;
  }

  /** The client's Bookings screen listens for this, so their view updates without a refresh. */
  private async notifyClient(bookingId: string, clientId: string): Promise<void> {
    const booking = await this.prisma.booking.findUniqueOrThrow({
      where: { id: bookingId },
      include: { provider: true, service: true },
    });
    const alreadyRated = await this.prisma.review.findFirst({
      where: { bookingId, raterId: clientId },
      select: { id: true },
    });
    this.socketEmitter.emitToUser(
      clientId,
      'booking.updated',
      toBookingRowDto(booking, !!alreadyRated),
    );

    // Every provider-side booking decision funnels through here, so one send
    // covers confirm, decline and completion. The client is waiting on an
    // answer they did not initiate, which is exactly the case a socket cannot
    // serve — they have almost certainly put the phone down.
    const summary = BOOKING_STATUS_NOTIFICATION[booking.status];
    if (summary) {
      void this.push.sendToUser(clientId, {
        title: summary.title,
        body: `${booking.provider.displayName} · ${booking.service.name}`,
        data: { type: 'booking.updated', bookingId },
      });
    }
  }

  /**
   * The provider side of the same Payment ledger every escrow movement in
   * this codebase writes to. `releasedUsdCents` is what escrow has let go
   * of into the provider's balance (net of the platform fee) — earned, not
   * necessarily paid: `paidOutUsdCents` is what an admin has recorded as
   * actually transferred. `pendingUsdCents` is still held — work in progress. Refunded/failed entries count
   * toward neither total but still appear in the list, since a stylist
   * needs to see a refund happened, not just that it isn't money for them.
   */
  async getEarnings(providerProfileId: string): Promise<ProviderEarningsDto> {
    // The ledger is append-only, so a completed Paynow job has both a held
    // row and a newer released row. Totals describe the current state of
    // each booking/order, not the sum of every historical movement: only the
    // newest row per subject (booking, else order) counts. DISTINCT ON picks
    // that row in the database so neither totals nor the list need every
    // payment the provider ever had loaded into memory. `id DESC` is only a
    // deterministic tiebreak for rows sharing a createdAt.
    const subjectKey = Prisma.sql`(CASE WHEN p."bookingId" IS NOT NULL THEN 'booking:' || p."bookingId" ELSE 'order:' || p."orderId" END)`;
    const latestPayments = Prisma.sql`
      WITH latest AS (
        SELECT DISTINCT ON (${subjectKey}) p.*
        FROM "Payment" p
        -- Only money that went through the app is StylistsCenter's to pay
        -- out. Jobs paid to the stylist directly also write a 'cash' row
        -- for the audit trail; counting those made them read "Awaiting
        -- payout" although the stylist already had the money.
        WHERE p.provider <> 'cash'
          AND (EXISTS (
                SELECT 1 FROM "Booking" b
                WHERE b.id = p."bookingId" AND b."providerId" = ${providerProfileId}
              )
           OR EXISTS (
                SELECT 1 FROM "Order" o
                WHERE o.id = p."orderId" AND o."providerId" = ${providerProfileId}
              ))
        ORDER BY ${subjectKey}, p."createdAt" DESC, p.id DESC
      )`;

    const [[totals], rows, payouts] = await Promise.all([
      // Totals cover every subject, not just the 100 listed below.
      this.prisma.$queryRaw<{ released: bigint; pending: bigint }[]>`
        ${latestPayments}
        SELECT
          coalesce(sum("amountUsdCents" - "feeUsdCents") FILTER (WHERE status = 'released'), 0)::bigint AS released,
          coalesce(sum("amountUsdCents") FILTER (WHERE status IN ('pending', 'paid', 'held', 'disputed')), 0)::bigint AS pending
        FROM latest
      `,
      this.prisma.$queryRaw<
        {
          id: string;
          bookingId: string | null;
          reference: string | null;
          counterpartyName: string | null;
          amountUsdCents: number;
          feeUsdCents: number;
          status: string;
          createdAt: Date;
          releasedRunning: bigint;
        }[]
      >`
        ${latestPayments}
        SELECT l.id,
               l."bookingId",
               coalesce(b.reference, o.reference) AS reference,
               coalesce(bc."displayName", ob."displayName") AS "counterpartyName",
               l."amountUsdCents",
               l."feeUsdCents",
               l.status,
               l."createdAt",
               -- Released earnings up to and including this row, oldest
               -- first, over ALL of the provider's subjects (the window runs
               -- before the LIMIT). Payouts are recorded as lump sums, so
               -- they are attributed to the oldest released jobs first.
               coalesce(sum(l."amountUsdCents" - l."feeUsdCents")
                 FILTER (WHERE l.status = 'released')
                 OVER (ORDER BY l."createdAt", l.id), 0)::bigint AS "releasedRunning"
        FROM latest l
        LEFT JOIN "Booking" b ON b.id = l."bookingId"
        LEFT JOIN "User" bc ON bc.id = b."clientId"
        LEFT JOIN "Order" o ON o.id = l."orderId"
        LEFT JOIN "User" ob ON ob.id = o."buyerId"
        ORDER BY l."createdAt" DESC, l.id DESC
        LIMIT 100
      `,
      // What an admin has actually recorded as paid to this provider.
      this.prisma.payout.aggregate({
        where: { providerId: providerProfileId },
        _sum: { amountUsdCents: true },
      }),
    ]);
    const paidOutUsdCents = payouts._sum.amountUsdCents ?? 0;
    const releasedUsdCents = Number(totals?.released ?? 0);

    // History is a provider-facing statement of where each job/order stands
    // now, not the internal escrow audit trail. Rendering every ledger row
    // made one completed job appear twice as both "In progress" and "Paid
    // out", even though the totals above already treated it as one payout.
    const entries: ProviderEarningsEntryDto[] = rows.map((payment) => ({
      id: payment.id,
      reference: payment.reference ?? '',
      kind: payment.bookingId ? 'booking' : 'order',
      counterpartyName: payment.counterpartyName ?? '',
      amountUsdCents: payment.amountUsdCents,
      feeUsdCents: payment.feeUsdCents,
      status: payment.status as ProviderEarningsEntryDto['status'],
      createdAt: payment.createdAt.toISOString(),
      // "Released" only means escrow let go of it into the provider's balance;
      // it is paid out once recorded payouts cover it.
      paidOut: payment.status === 'released' && Number(payment.releasedRunning) <= paidOutUsdCents,
    }));

    return {
      ...(await this.directEarnings(providerProfileId)),
      releasedUsdCents,
      pendingUsdCents: Number(totals?.pending ?? 0),
      paidOutUsdCents,
      awaitingPayoutUsdCents: Math.max(0, releasedUsdCents - paidOutUsdCents),
      entries,
    };
  }

  /**
   * Earnings under the pay-directly model, from the bookings and orders
   * themselves: what the client handed over (price + fee - coins for a
   * booking; products + delivery - coins for an order), and the fee each one
   * put on the stylist's monthly bill.
   */
  private async directEarnings(providerId: string): Promise<{
    receivedUsdCents: number;
    receivedThisMonthUsdCents: number;
    toCollectUsdCents: number;
    feesOwedUsdCents: number;
    jobs: ProviderEarningsJobDto[];
  }> {
    const monthStart = harareMonthStart(harareMonthKey(new Date()));
    const doneBooking = {
      providerId,
      paymentMethod: 'cash' as const,
      status: 'completed' as const,
    };
    const doneOrder = {
      providerId,
      paymentMethod: 'cash' as const,
      status: { in: ['collected' as const, 'delivered' as const] },
    };
    const bookingSums = {
      priceUsdCents: true,
      serviceFeeUsdCents: true,
      coinsUsdCents: true,
    } as const;
    // The fee is part of what the client handed over only when the client
    // paid it (serviceFeePaidBy, frozen per booking as clientPaysFee).
    const clientFee = async (where: Prisma.BookingWhereInput) =>
      (
        await this.prisma.booking.aggregate({
          where: { ...where, clientPaysFee: true },
          _sum: { serviceFeeUsdCents: true },
        })
      )._sum.serviceFeeUsdCents ?? 0;
    const orderSums = {
      totalUsdCents: true,
      deliveryChargeUsdCents: true,
      coinsValueUsdCents: true,
    } as const;

    const [
      bookingsAll,
      bookingsMonth,
      ordersAll,
      ordersMonth,
      upcoming,
      feesOwedUsdCents,
      bookings,
      orders,
      feeAll,
      feeMonth,
      feeUpcoming,
    ] = await Promise.all([
      this.prisma.booking.aggregate({ where: doneBooking, _sum: bookingSums }),
      this.prisma.booking.aggregate({
        where: { ...doneBooking, completedAt: { gte: monthStart } },
        _sum: bookingSums,
      }),
      this.prisma.order.aggregate({ where: doneOrder, _sum: orderSums }),
      this.prisma.order.aggregate({
        where: { ...doneOrder, completedAt: { gte: monthStart } },
        _sum: orderSums,
      }),
      this.prisma.booking.aggregate({
        where: { providerId, paymentMethod: 'cash', status: 'confirmed' },
        _sum: bookingSums,
      }),
      this.fees
        ? this.fees.balance(providerId)
        : new FeeLedgerService(this.prisma).balance(providerId),
      this.prisma.booking.findMany({
        where: { providerId, paymentMethod: 'cash', status: { in: ['completed', 'incomplete'] } },
        include: { client: { select: { displayName: true } } },
        orderBy: { updatedAt: 'desc' },
        take: 100,
      }),
      this.prisma.order.findMany({
        where: doneOrder,
        include: { buyer: { select: { displayName: true } } },
        orderBy: { updatedAt: 'desc' },
        take: 100,
      }),
      clientFee(doneBooking),
      clientFee({ ...doneBooking, completedAt: { gte: monthStart } }),
      clientFee({ providerId, paymentMethod: 'cash', status: 'confirmed' }),
    ]);

    interface BookingSum {
      priceUsdCents: number | null;
      serviceFeeUsdCents: number | null;
      coinsUsdCents: number | null;
    }
    interface OrderSum {
      totalUsdCents: number | null;
      deliveryChargeUsdCents: number | null;
      coinsValueUsdCents: number | null;
    }
    const bookingCash = (s: BookingSum, feesClientPaid: number) =>
      Math.max(0, (s.priceUsdCents ?? 0) + feesClientPaid - (s.coinsUsdCents ?? 0));
    const orderCash = (s: OrderSum) =>
      Math.max(
        0,
        (s.totalUsdCents ?? 0) + (s.deliveryChargeUsdCents ?? 0) - (s.coinsValueUsdCents ?? 0),
      );

    // Each job's fee after waivers, from the fee ledger.
    const feeRows = await this.prisma.feeLedgerEntry.groupBy({
      by: ['bookingId', 'orderId'],
      where: {
        providerId,
        OR: [
          { bookingId: { in: bookings.map((b) => b.id) } },
          { orderId: { in: orders.map((o) => o.id) } },
        ],
      },
      _sum: { amountUsdCents: true },
    });
    const feeFor = (ref: { bookingId?: string; orderId?: string }) =>
      feeRows
        .filter((r) => (ref.bookingId ? r.bookingId === ref.bookingId : r.orderId === ref.orderId))
        .reduce((sum, r) => sum + (r._sum.amountUsdCents ?? 0), 0);

    const jobs: ProviderEarningsJobDto[] = [
      ...bookings.map((b): ProviderEarningsJobDto => {
        const { amountDueUsdCents } = bookingAmounts(b);
        const status: ProviderEarningsJobDto['status'] =
          b.status === 'completed'
            ? 'received'
            : b.nonPaymentReportedAt
              ? 'not_paid'
              : 'not_confirmed';
        return {
          id: b.id,
          kind: 'booking',
          reference: b.reference,
          counterpartyName: b.client.displayName,
          at: (b.completedAt ?? b.updatedAt).toISOString(),
          priceUsdCents: b.priceUsdCents,
          receivedUsdCents: status === 'received' ? amountDueUsdCents : 0,
          coinsUsdCents: b.coinsUsdCents,
          feeUsdCents: feeFor({ bookingId: b.id }),
          status,
        };
      }),
      ...orders.map((o): ProviderEarningsJobDto => ({
        id: o.id,
        kind: 'order',
        reference: o.reference,
        counterpartyName: o.buyer.displayName,
        at: (o.completedAt ?? o.updatedAt).toISOString(),
        priceUsdCents: o.totalUsdCents,
        receivedUsdCents: orderAmountDueUsdCents({
          productTotalUsdCents: o.totalUsdCents,
          deliveryChargeUsdCents: o.deliveryChargeUsdCents,
          coinsValueUsdCents: o.coinsValueUsdCents,
        }),
        coinsUsdCents: o.coinsValueUsdCents,
        feeUsdCents: feeFor({ orderId: o.id }),
        status: 'received',
      })),
    ]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 100);

    return {
      receivedUsdCents: bookingCash(bookingsAll._sum, feeAll) + orderCash(ordersAll._sum),
      receivedThisMonthUsdCents:
        bookingCash(bookingsMonth._sum, feeMonth) + orderCash(ordersMonth._sum),
      toCollectUsdCents: bookingCash(upcoming._sum, feeUpcoming),
      feesOwedUsdCents,
      jobs,
    };
  }

  /** Append-only, same as every other escrow movement in this codebase. */
  private async refundIfHeld(bookingId: string): Promise<void> {
    const held = await this.prisma.payment.findFirst({
      where: { bookingId, status: { in: ['paid', 'held'] } },
      orderBy: { createdAt: 'desc' },
    });
    if (!held) return;

    await this.prisma.payment.create({
      data: {
        bookingId,
        provider: held.provider,
        status: 'refunded',
        amountUsdCents: held.amountUsdCents,
        // Declined work delivers nothing, so the platform keeps nothing.
        feeUsdCents: 0,
        externalRef: held.externalRef,
      },
    });
  }
}

/**
 * Straight-line distance between the stylist and where the client asked from.
 *
 * Done in JS rather than PostGIS because a MatchRequest's coordinates are
 * plain columns with no geography index — this is one row per offer on a
 * screen that shows a handful, not a query that needs to scale.
 */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const EARTH_RADIUS_KM = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.asin(Math.sqrt(a));
}

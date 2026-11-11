import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  BookingRowDto,
  ConfirmCompletionResponse,
  CreateBookingInput,
  CreateBookingResponse,
  CreateReviewInput,
  RescheduleBookingInput,
} from '@sc/shared';
import {
  canCancelBooking,
  clientTotalCents,
  feeCents,
  formatBookingReference,
  isLateCancellation,
  maxCoinsForBooking,
  FREE_CANCELLATION_WINDOW_HOURS,
} from '@sc/shared';
import { Optional } from '@nestjs/common';
import { SettingsService, settingsFor } from '../settings/settings.service';
import { FeeStandingService } from '../fees/fee-standing.service';
import { RewardsHooksService } from '../rewards/rewards-hooks.service';
import { BookingLifecycleService } from './booking-lifecycle.service';
import { PrismaService } from '../prisma/prisma.service';
import { SocketEmitterService } from '../realtime/socket-emitter.service';
import { PushService } from '../notifications/push.service';
import { MatchingService } from '../matching/matching.service';
import { PaymentStatusService } from '../payments/payment-status.service';
import { TrustService } from '../trust/trust.service';
import { toBookingRowDto } from './mappers';
import { isWithinWeeklyHours, readWeeklyHours } from '../providers/calendar-policy';

const NON_BLOCKING_STATUSES = ['cancelled', 'declined'] as const;

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly socketEmitter: SocketEmitterService,
    private readonly matching: MatchingService,
    private readonly trust: TrustService,
    private readonly push: PushService,
    private readonly paymentStatus: PaymentStatusService,
    private readonly standing: FeeStandingService,
    private readonly rewards: RewardsHooksService,
    private readonly lifecycle: BookingLifecycleService,
    @Optional() private readonly settings?: SettingsService,
  ) {}

  async create(clientId: string, input: CreateBookingInput): Promise<CreateBookingResponse> {
    const service = await this.prisma.service.findUnique({
      where: { id: input.serviceId },
      include: { provider: true },
    });
    if (service?.providerId !== input.providerId) {
      throw new NotFoundException('Service not found for this provider');
    }
    // A stylist booking themselves would be a way to fake completed jobs,
    // ratings and coins.
    if (service.provider.userId === clientId) {
      throw new BadRequestException("You can't book your own services");
    }
    // Checked before anything else is written: a stylist whose fee balance is
    // overdue takes no new bookings, however the client reached them.
    await this.standing.assertCanTrade(input.providerId);

    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60_000);
    if (
      !Number.isFinite(startsAt.getTime()) ||
      startsAt <= new Date() ||
      !isWithinWeeklyHours(readWeeklyHours(service.provider.weeklyHours), startsAt, endsAt)
    ) {
      throw new BadRequestException('That time is outside this stylist’s working hours');
    }
    const existingTimeOff = await this.prisma.providerTimeOff.findFirst({
      where: { providerId: input.providerId, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } },
    });
    if (existingTimeOff) throw new BadRequestException('That stylist is away at this time');
    const reference = formatBookingReference(await this.nextBookingSequence());

    // The client pays the stylist directly, so there is no checkout to start
    // here. The fee is frozen now, from today's setting, so a later change
    // never rewrites what this client was shown.
    const config = this.settings ?? settingsFor(this.prisma);
    const [serviceFeeBps, coinUsdCents] = await Promise.all([
      config.get('serviceFeeBps'),
      config.get('coinUsdCents'),
    ]);
    const serviceFeeUsdCents = feeCents(service.priceUsdCents, serviceFeeBps);
    const clientTotal = clientTotalCents(service.priceUsdCents, serviceFeeBps);
    const coins = input.coins ?? 0;
    const maxCoins = maxCoinsForBooking(clientTotal, coinUsdCents);
    if (coins > maxCoins) {
      throw new BadRequestException(
        maxCoins === 0
          ? "Coins can't be used on this booking"
          : `You can use at most ${String(maxCoins)} coins on this booking`,
      );
    }

    const booking = await this.prisma.$transaction(async (tx) => {
      // A per-provider transaction lock closes the read-then-write race while
      // keeping unrelated stylists fully concurrent. The exclusion constraint
      // in the migration remains the final database-level safeguard for any
      // future write path that does not use this service.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.providerId}))`;

      // Calendar edits take the same lock, so a newly blocked period cannot race checkout.
      const currentProfile = await tx.providerProfile.findUniqueOrThrow({
        where: { id: input.providerId },
        select: { weeklyHours: true },
      });
      if (!isWithinWeeklyHours(readWeeklyHours(currentProfile.weeklyHours), startsAt, endsAt)) {
        throw new BadRequestException('That time is no longer available');
      }
      const blocked = await tx.providerTimeOff.findFirst({
        where: { providerId: input.providerId, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } },
      });
      if (blocked) throw new BadRequestException('That time is no longer available');

      const conflict = await tx.booking.findFirst({
        where: {
          providerId: input.providerId,
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt },
          status: { notIn: [...NON_BLOCKING_STATUSES] },
        },
      });
      if (conflict) throw new BadRequestException('That time is no longer available');

      // A match is only consumed after its appointment range is known to be
      // free. Keeping the provider lock until the row is written prevents a
      // second client from taking the same appointment in the meantime. It
      // must come before the booking insert: the insert's foreign key would
      // otherwise hold a lock on the match row that this step waits on.
      if (input.matchId) {
        await this.matching.confirmForBooking(input.matchId, clientId, input.providerId);
      }

      const created = await tx.booking.create({
        data: {
          reference,
          clientId,
          providerId: input.providerId,
          serviceId: input.serviceId,
          matchRequestId: input.matchId ?? null,
          startsAt,
          endsAt,
          // 'cash' is the stored name for "paid to the stylist directly".
          paymentMethod: 'cash',
          priceUsdCents: service.priceUsdCents,
          serviceFeeUsdCents,
          serviceFeeBps,
        },
      });

      if (coins > 0) {
        // Inside this transaction: if the hook refuses (not enough coins) the
        // booking is not created, and if the booking fails the coins stay put.
        const { usdCents } = await this.rewards.redeemForBooking(tx, {
          bookingId: created.id,
          clientId,
          providerUserId: service.provider.userId,
          coins,
        });
        if (usdCents < 0 || usdCents > clientTotal) {
          throw new BadRequestException("Coins can't be used on this booking");
        }
        await tx.booking.update({
          where: { id: created.id },
          data: { coinsUsed: coins, coinsUsdCents: usdCents },
        });
      }

      return tx.booking.findUniqueOrThrow({ where: { id: created.id } });
    });

    const row = await this.toRowById(booking.id);
    this.socketEmitter.emitToUser(clientId, 'booking.updated', row);

    return {
      id: booking.id,
      reference: booking.reference,
      status: booking.status,
    };
  }

  /**
   * Only for bookings paid in the app before clients paid stylists directly.
   * Reports the latest known state of a booking's payment, actively polling
   * Paynow first if it's still pending — the client screen that sent someone
   * a phone prompt needs a real answer to show, and the inbound webhook alone
   * cannot be relied on (never reaches a non-public dev server, and even in
   * production there's a window before it arrives).
   */
  async getPaymentStatus(bookingId: string, clientId: string): Promise<{ status: string }> {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.clientId !== clientId) throw new ForbiddenException();

    const { status } = await this.paymentStatus.resolve({ bookingId });
    return { status };
  }

  async reschedule(
    bookingId: string,
    clientId: string,
    input: RescheduleBookingInput,
  ): Promise<BookingRowDto> {
    const startsAt = new Date(input.startsAt);
    const minimum = Date.now() + FREE_CANCELLATION_WINDOW_HOURS * 60 * 60_000;
    if (
      !Number.isFinite(startsAt.getTime()) ||
      startsAt.getTime() < minimum ||
      startsAt.getTime() > Date.now() + 30 * 24 * 60 * 60_000
    ) {
      throw new BadRequestException('Choose a new time between two hours and 30 days from now');
    }
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        provider: { select: { userId: true } },
        service: { select: { durationMinutes: true } },
      },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.clientId !== clientId) throw new ForbiddenException();
    if (
      booking.matchRequestId ||
      !['awaiting_provider', 'confirmed'].includes(booking.status) ||
      booking.startsAt.getTime() < minimum
    ) {
      throw new BadRequestException('This booking can no longer be rescheduled');
    }
    if (booking.startsAt.getTime() === startsAt.getTime()) return this.toRowById(bookingId);
    const endsAt = new Date(startsAt.getTime() + booking.service.durationMinutes * 60_000);
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${booking.providerId}))`;
      const current = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
      if (
        !['awaiting_provider', 'confirmed'].includes(current.status) ||
        current.startsAt.getTime() < minimum
      ) {
        throw new BadRequestException('This booking can no longer be rescheduled');
      }
      const profile = await tx.providerProfile.findUniqueOrThrow({
        where: { id: booking.providerId },
        select: { weeklyHours: true },
      });
      if (!isWithinWeeklyHours(readWeeklyHours(profile.weeklyHours), startsAt, endsAt)) {
        throw new BadRequestException('That time is outside this stylist’s working hours');
      }
      const conflict = await tx.booking.findFirst({
        where: {
          providerId: booking.providerId,
          id: { not: bookingId },
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt },
          status: { notIn: [...NON_BLOCKING_STATUSES] },
        },
      });
      const blocked = await tx.providerTimeOff.findFirst({
        where: {
          providerId: booking.providerId,
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt },
        },
      });
      if (conflict || blocked) throw new BadRequestException('That time is no longer available');
      await tx.booking.update({
        where: { id: bookingId },
        data: {
          startsAt,
          endsAt,
          status: 'awaiting_provider',
          confirmedByClient: false,
          confirmedByProvider: false,
          confirmedByClientAt: null,
          confirmedByProviderAt: null,
        },
      });
    });
    const row = await this.toRowById(bookingId);
    this.socketEmitter.emitToUser(clientId, 'booking.updated', row);
    this.socketEmitter.emitToUser(booking.provider.userId, 'booking.updated', row);
    void this.push.sendToUser(booking.provider.userId, {
      title: 'Booking time changed',
      body: `Booking ${booking.reference} moved to ${row.whenLabel}. Please confirm the new time.`,
      data: { type: 'booking.updated', bookingId },
    });
    return row;
  }

  async listForClient(clientId: string): Promise<BookingRowDto[]> {
    await this.lifecycle.expireStale({ clientId });
    const bookings = await this.prisma.booking.findMany({
      where: { clientId },
      // toBookingRowDto is typed against the full provider/service rows, so
      // the include stays; the cap is what bounds the payload.
      include: { provider: true, service: true },
      orderBy: { startsAt: 'desc' },
      take: 100,
    });

    const reviewed = await this.prisma.review.findMany({
      where: { raterId: clientId, bookingId: { in: bookings.map((b) => b.id) } },
      select: { bookingId: true },
    });
    const reviewedIds = new Set(reviewed.map((r) => r.bookingId));

    return bookings.map((b) => toBookingRowDto(b, reviewedIds.has(b.id)));
  }

  /** The client's "job done". The stylist's side is `ProviderService.confirmCompletion`. */
  async confirmCompletion(bookingId: string, clientId: string): Promise<ConfirmCompletionResponse> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { provider: true },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.clientId !== clientId) throw new ForbiddenException();

    const updated = await this.lifecycle.confirm(bookingId, 'client');

    const row = await this.toRowById(bookingId);
    this.socketEmitter.emitToUser(clientId, 'booking.updated', row);
    this.socketEmitter.emitToUser(booking.provider.userId, 'booking.updated', row);

    // The stylist, not the client: the client is the one who just tapped
    // confirm, and telling someone about their own action is how an app
    // teaches people to ignore its notifications.
    if (!booking.confirmedByClient) {
      void this.push.sendToUser(booking.provider.userId, {
        title: 'Client confirmed completion',
        body: `Booking ${booking.reference}`,
        data: { type: 'booking.updated', bookingId },
      });
    }

    return {
      confirmedByClient: updated.confirmedByClient,
      confirmedByProvider: updated.confirmedByProvider,
      status: updated.status,
    };
  }

  async createReview(bookingId: string, clientId: string, input: CreateReviewInput): Promise<void> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { provider: true },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.clientId !== clientId) throw new ForbiddenException();
    if (booking.status !== 'completed') {
      throw new BadRequestException('Can only review a completed booking');
    }

    const existing = await this.prisma.review.findFirst({
      where: { bookingId, raterId: clientId },
    });
    if (existing) throw new BadRequestException('Already reviewed this booking');

    const providerUserId = booking.provider.userId;

    await this.prisma.$transaction(async (tx) => {
      await tx.review.create({
        data: {
          bookingId,
          raterId: clientId,
          rateeId: providerUserId,
          rating: input.rating,
          ...(input.text ? { text: input.text } : {}),
        },
      });

      const agg = await tx.review.aggregate({
        where: { rateeId: providerUserId },
        _avg: { rating: true },
      });
      await tx.providerProfile.update({
        where: { id: booking.providerId },
        data: { ratingAvg: agg._avg.rating ?? input.rating },
      });
    });
  }

  /**
   * Client-initiated cancellation.
   *
   * There was previously no way to cancel at all, even though the schema has
   * had a `cancelled` status throughout — so a client who could not make it
   * had only one option, which was to not turn up. The Bookings screen warns
   * that five no-shows remove an account, so the product was punishing the
   * behaviour it left no alternative to.
   */
  async cancel(bookingId: string, clientId: string): Promise<BookingRowDto> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { provider: true },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.clientId !== clientId) throw new ForbiddenException();

    // Idempotent: cancelling an already-cancelled booking is a retry (a
    // dropped response, a double tap), not an error worth showing anyone.
    if (booking.status === 'cancelled') return this.toRowById(bookingId);

    if (!canCancelBooking(booking.status)) {
      throw new BadRequestException(`Cannot cancel a booking in status "${booking.status}"`);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${bookingId}))`;
      const current = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
      // Lost a race with the stylist or the sweep: do not cancel a finished job.
      if (!canCancelBooking(current.status)) {
        throw new BadRequestException(`Cannot cancel a booking in status "${current.status}"`);
      }
      await tx.booking.update({ where: { id: bookingId }, data: { status: 'cancelled' } });
      // No fee is charged for a cancelled booking (the fee is only charged on
      // completion); the client gets any coins they spent back.
      if (current.coinsUsed > 0) await this.rewards.refundRedemption(tx, { bookingId });
    });

    /**
     * Inside the free-cancellation window this costs the client nothing.
     * Outside it, the stylist has lost a slot they can no longer resell, so
     * it counts toward account standing — the same ledger the "five no-shows
     * remove an account" policy on the Bookings screen refers to, which until
     * now was never actually written to.
     *
     * The client is still refunded in full: this codebase has no
     * cancellation-fee mechanism, and inventing a charge is a commercial
     * decision, not an implementation detail.
     */
    if (isLateCancellation(booking.startsAt.toISOString())) {
      await this.trust.recordStrike(clientId, bookingId, 'late_cancellation');
    }

    // Bookings paid in the app before direct payment: an EcoCash booking has real value sitting in escrow,
    // and a cancellation that freed the slot but kept the client's money would
    // be the worst possible bug in this flow.
    if (booking.paymentMethod === 'ecocash') {
      await this.refundEscrow(bookingId);
    }

    const row = await this.toRowById(bookingId);
    this.socketEmitter.emitToUser(clientId, 'booking.updated', row);

    // The stylist was never told a client cancelled — not by socket, not at
    // all — so a slot freed up and the only way to discover it was to reopen
    // the Jobs screen and notice. They are the party with something to act on
    // here, so they get both the live update and the notification.
    this.socketEmitter.emitToUser(booking.provider.userId, 'booking.updated', row);
    void this.push.sendToUser(booking.provider.userId, {
      title: 'Booking cancelled',
      body: `Booking ${booking.reference} was cancelled by the client`,
      data: { type: 'booking.updated', bookingId },
    });
    return row;
  }

  /** Same append-only ledger as a release — a refund is a NEW row. */
  private async refundEscrow(bookingId: string): Promise<void> {
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
        // No platform fee on a cancellation: the platform did not deliver
        // anything, so it does not keep anything.
        feeUsdCents: 0,
        externalRef: held.externalRef,
      },
    });
  }

  /** Append-only ledger (plan §6): a release is a NEW row, never an update of the held one. */
  private async releaseEscrow(bookingId: string): Promise<void> {
    const held = await this.prisma.payment.findFirst({
      where: { bookingId, status: { in: ['paid', 'held'] } },
      orderBy: { createdAt: 'desc' },
    });
    if (!held) return;

    await this.prisma.payment.create({
      data: {
        bookingId,
        provider: held.provider,
        status: 'released',
        amountUsdCents: held.amountUsdCents,
        feeUsdCents: held.feeUsdCents,
        externalRef: held.externalRef,
      },
    });
  }

  private async toRowById(bookingId: string): Promise<BookingRowDto> {
    const booking = await this.prisma.booking.findUniqueOrThrow({
      where: { id: bookingId },
      include: { provider: true, service: true },
    });
    const alreadyRated = await this.prisma.review.findFirst({
      where: { bookingId, raterId: booking.clientId },
    });
    return toBookingRowDto(booking, !!alreadyRated);
  }

  /**
   * Race-free monotonic counter for the "SC-4471" reference (plan §9 — a real
   * Postgres sequence, not a row count). Called outside any transaction:
   * `nextval` is never rolled back regardless of what happens to a
   * surrounding transaction, so there is nothing gained by taking it from
   * inside one, and `create()` needs the reference before it opens its own.
   */
  private async nextBookingSequence(): Promise<number> {
    const [row] = await this.prisma.$queryRaw<{ nextval: bigint }[]>`
      SELECT nextval('booking_reference_seq')
    `;
    return Number(row?.nextval ?? 0);
  }
}

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  BookingRowDto,
  BookingStatus,
  ConfirmCompletionResponse,
  CreateBookingInput,
  CreateBookingResponse,
  CreateReviewInput,
} from '@sc/shared';
import {
  canCancelBooking,
  formatBookingReference,
  isLateCancellation,
  isSubscriptionActive,
  needsCashReconciliation,
  normalizePhone,
  REFERRAL_REWARD_COINS,
  coinsToUsdCents,
} from '@sc/shared';
import { PrismaService } from '../prisma/prisma.service';
import { SocketEmitterService } from '../realtime/socket-emitter.service';
import { PushService } from '../notifications/push.service';
import { MatchingService } from '../matching/matching.service';
import {
  PAYMENT_GATEWAY,
  type PaymentGatewayPort,
  type PaymentIntentResult,
} from '../payments/payment-gateway.port';
import { PaymentStatusService } from '../payments/payment-status.service';
import { TrustService } from '../trust/trust.service';
import { toBookingRowDto } from './mappers';
import { expireStaleBookingRequests } from './booking-expiry';

const NON_BLOCKING_STATUSES = ['cancelled', 'declined'] as const;

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly socketEmitter: SocketEmitterService,
    private readonly matching: MatchingService,
    private readonly trust: TrustService,
    private readonly push: PushService,
    @Inject(PAYMENT_GATEWAY) private readonly paymentGateway: PaymentGatewayPort,
    private readonly paymentStatus: PaymentStatusService,
  ) {}

  async create(clientId: string, input: CreateBookingInput): Promise<CreateBookingResponse> {
    const service = await this.prisma.service.findUnique({
      where: { id: input.serviceId },
      include: { provider: true },
    });
    if (service?.providerId !== input.providerId) {
      throw new NotFoundException('Service not found for this provider');
    }
    // Discovery (search, "Available now", smart-match fan-out) already
    // excludes a provider whose subscription has lapsed — this closes the
    // remaining gap where a client still has their profile/service open
    // from before it lapsed, or reached it via a chat/booking-history link.
    if (!isSubscriptionActive(service.provider.subscriptionPaidUntil?.toISOString() ?? null)) {
      throw new BadRequestException("This stylist isn't currently accepting bookings");
    }

    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60_000);
    const reference = formatBookingReference(await this.nextBookingSequence());

    // EcoCash checkout is created BEFORE the match is confirmed and the
    // booking is written, not after. `confirmForBooking` moves a MatchRequest
    // to 'confirmed' — a state whose only allowed exit is 'no_show' (see
    // match.ts's ALLOWED_TRANSITIONS) — and declines every sibling offer as
    // part of the same step. Both are effectively irreversible. Doing this
    // first and only then attempting checkout meant a gateway failure left
    // the match permanently stuck "confirmed" with no booking behind it and
    // no way for the client to ever complete or retry it. Creating the
    // checkout intent first means a gateway failure never touches the match
    // or the database at all — the client just sees the request fail and can
    // retry cleanly. The remaining risk (the slot filling in the gap between
    // a successful checkout and the transaction below) leaves an orphaned
    // Paynow payment intent with no booking, which is recoverable; a wedged
    // MatchRequest was not.
    let checkoutIntent: PaymentIntentResult | undefined;
    if (input.paymentMethod === 'ecocash') {
      const client = await this.prisma.user.findUniqueOrThrow({
        where: { id: clientId },
        select: { phone: true },
      });
      // The number the client typed at checkout, which need not be the line
      // they log in with. Normalised here so the adapter always receives E.164.
      const payerPhone = input.payerPhone ? normalizePhone(input.payerPhone) : null;
      checkoutIntent = await this.paymentGateway.createCheckout({
        reference,
        amountUsdCents: service.priceUsdCents,
        description: `Booking ${reference}: ${service.name}`,
        phone: payerPhone ?? client.phone,
      });
    }

    const booking = await this.prisma.$transaction(async (tx) => {
      // A per-provider transaction lock closes the read-then-write race while
      // keeping unrelated stylists fully concurrent. The exclusion constraint
      // in the migration remains the final database-level safeguard for any
      // future write path that does not use this service.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.providerId}))`;

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
      // second client from taking the same appointment in the meantime.
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
          paymentMethod: input.paymentMethod,
          priceUsdCents: service.priceUsdCents,
        },
      });

      if (checkoutIntent) {
        await tx.payment.create({
          data: {
            bookingId: created.id,
            provider: checkoutIntent.provider,
            status: checkoutIntent.status,
            amountUsdCents: service.priceUsdCents,
            externalRef: checkoutIntent.externalRef,
            reference,
          },
        });
      }

      return created;
    });

    const row = await this.toRowById(booking.id);
    this.socketEmitter.emitToUser(clientId, 'booking.updated', row);

    return {
      id: booking.id,
      reference: booking.reference,
      status: booking.status,
      ...(checkoutIntent?.checkoutUrl ? { checkoutUrl: checkoutIntent.checkoutUrl } : {}),
      ...(checkoutIntent?.instructions ? { instructions: checkoutIntent.instructions } : {}),
    };
  }

  /**
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

  async listForClient(clientId: string): Promise<BookingRowDto[]> {
    await expireStaleBookingRequests(this.prisma, { clientId });
    const bookings = await this.prisma.booking.findMany({
      where: { clientId },
      include: { provider: true, service: true },
      orderBy: { startsAt: 'desc' },
    });

    const reviewed = await this.prisma.review.findMany({
      where: { raterId: clientId, bookingId: { in: bookings.map((b) => b.id) } },
      select: { bookingId: true },
    });
    const reviewedIds = new Set(reviewed.map((r) => r.bookingId));

    return bookings.map((b) => toBookingRowDto(b, reviewedIds.has(b.id)));
  }

  async confirmCompletion(bookingId: string, clientId: string): Promise<ConfirmCompletionResponse> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { provider: true },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.clientId !== clientId) throw new ForbiddenException();
    if (booking.status === 'completed') {
      return {
        confirmedByClient: booking.confirmedByClient,
        confirmedByProvider: booking.confirmedByProvider,
        status: booking.status,
      };
    }
    // Both the cash and EcoCash happy paths are awaiting_provider -> confirmed
    // -> completed — completion only makes sense once the provider has
    // confirmed the appointment, never while still awaiting them.
    if (booking.status !== 'confirmed') {
      throw new BadRequestException(
        `Cannot confirm completion for a booking in status "${booking.status}"`,
      );
    }

    if (booking.confirmedByClient) {
      return {
        confirmedByClient: booking.confirmedByClient,
        confirmedByProvider: booking.confirmedByProvider,
        status: booking.status,
      };
    }

    // Cash needs both sides (needsCashReconciliation); EcoCash's escrow is
    // released on the client's word alone — they're the one who received the
    // service, so their confirmation is what the "held until complete" promise
    // (plan R3) actually turns on.
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${bookingId}))`;
      const current = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
      if (current.status === 'completed' || current.confirmedByClient) return current;

      const fundedPayment =
        current.paymentMethod === 'ecocash'
          ? await tx.payment.findFirst({
              where: { bookingId, status: { in: ['paid', 'held'] } },
              orderBy: { createdAt: 'desc' },
            })
          : null;
      if (current.paymentMethod === 'ecocash' && !fundedPayment) {
        throw new BadRequestException('Payment has not cleared yet');
      }

      const stillNeedsReconciliation = needsCashReconciliation({
        paymentMethod: current.paymentMethod,
        status: current.status,
        confirmedByClient: true,
        confirmedByProvider: current.confirmedByProvider,
      });
      const completes = current.paymentMethod === 'ecocash' || !stillNeedsReconciliation;
      const nextStatus: BookingStatus = completes ? 'completed' : current.status;
      const result = await tx.booking.update({
        where: { id: bookingId },
        data: { confirmedByClient: true, status: nextStatus },
      });

      if (completes) {
        await tx.providerProfile.update({
          where: { id: current.providerId },
          data: { completedCount: { increment: 1 } },
        });
        if (current.paymentMethod === 'ecocash') {
          if (fundedPayment) {
            await tx.payment.create({
              data: {
                bookingId,
                provider: fundedPayment.provider,
                status: 'released',
                amountUsdCents: fundedPayment.amountUsdCents,
                feeUsdCents: fundedPayment.feeUsdCents,
                externalRef: fundedPayment.externalRef,
              },
            });
          }
        } else {
          await tx.payment.create({
            data: {
              bookingId,
              provider: 'cash',
              status: 'released',
              amountUsdCents: current.priceUsdCents,
            },
          });
        }
        const referral = await tx.referral.findFirst({
          where: { referredUserId: current.clientId, status: 'pending' },
          include: { agent: { select: { userId: true } } },
        });
        if (referral) {
          const claimed = await tx.referral.updateMany({
            where: { id: referral.id, status: 'pending' },
            data: { status: 'paid' },
          });
          if (claimed.count === 1) {
            await tx.walletTransaction.create({
              data: {
                userId: referral.agent.userId,
                type: 'referral_coin',
                coins: REFERRAL_REWARD_COINS,
                usdCents: coinsToUsdCents(REFERRAL_REWARD_COINS),
                reference: `First completed booking ${current.reference}`,
              },
            });
          }
        }
      }
      return result;
    });

    const row = await this.toRowById(bookingId);
    this.socketEmitter.emitToUser(clientId, 'booking.updated', row);
    this.socketEmitter.emitToUser(booking.provider.userId, 'booking.updated', row);

    // The stylist, not the client: the client is the one who just tapped
    // confirm, and telling someone about their own action is how an app
    // teaches people to ignore its notifications.
    void this.push.sendToUser(booking.provider.userId, {
      title: 'Client confirmed completion',
      body: `Booking ${booking.reference}`,
      data: { type: 'booking.updated', bookingId },
    });

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

    await this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: 'cancelled' },
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

    // Money first-class: an EcoCash booking has real value sitting in escrow,
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

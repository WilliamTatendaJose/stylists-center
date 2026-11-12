import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { bookingAmounts, canProviderRespond, canReportNonPayment } from '@sc/shared';
import type { Booking, Prisma } from '../../generated/prisma';
import { FeeLedgerService } from '../fees/fee-ledger.service';
import { FeeStandingService } from '../fees/fee-standing.service';
import { PushService } from '../notifications/push.service';
import { PrismaService } from '../prisma/prisma.service';
import { SocketEmitterService } from '../realtime/socket-emitter.service';
import { RewardsHooksService } from '../rewards/rewards-hooks.service';
import { SettingsService, settingsFor } from '../settings/settings.service';
import { expireStaleBookingRequests } from './booking-expiry';
import { toBookingRowDto } from './mappers';

type Side = 'client' | 'provider';

/**
 * Every way a booking moves after it is created: the stylist accepting or
 * declining, the two confirmations, automatic completion, and a reported
 * non-payment. The client's and the stylist's endpoints both go through here
 * so there is exactly one place that decides when a booking is complete and
 * what completing it owes (the fee, the client's coins).
 *
 * Each transition takes the booking's advisory lock and re-reads the row, so
 * a double tap, the sweep and the other party racing each other settle on one
 * outcome and the fee and coins are recorded once.
 */
@Injectable()
export class BookingLifecycleService {
  private readonly logger = new Logger(BookingLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fees: FeeLedgerService,
    private readonly rewards: RewardsHooksService,
    private readonly standing: FeeStandingService,
    private readonly socketEmitter: SocketEmitterService,
    private readonly push: PushService,
    @Optional() private readonly settings?: SettingsService,
  ) {}

  /** Closes stale requests and gives back any coins spent on them. */
  expireStale(scope: Pick<Prisma.BookingWhereInput, 'clientId' | 'providerId'>): Promise<void> {
    return expireStaleBookingRequests(this.prisma, scope, this.rewards);
  }

  /**
   * The stylist accepts a request. Checked here, not just when the booking
   * was made: the account may have become restricted while the request waited.
   */
  async accept(bookingId: string, providerId: string): Promise<Booking> {
    await this.standing.assertCanTrade(providerId);
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, bookingId);
      const booking = await this.requireOwn(tx, bookingId, providerId);
      if (!canProviderRespond(booking.status)) {
        throw new BadRequestException(`Cannot confirm a booking that is ${booking.status}`);
      }
      return tx.booking.update({ where: { id: bookingId }, data: { status: 'confirmed' } });
    });
  }

  /** Declining frees the slot, so coins the client spent on it go back. */
  async decline(bookingId: string, providerId: string): Promise<Booking> {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, bookingId);
      const booking = await this.requireOwn(tx, bookingId, providerId);
      if (!canProviderRespond(booking.status)) {
        throw new BadRequestException(`Cannot decline a booking that is ${booking.status}`);
      }
      const updated = await tx.booking.update({
        where: { id: bookingId },
        data: { status: 'declined' },
      });
      if (booking.coinsUsed > 0) await this.rewards.refundRedemption(tx, { bookingId });
      return updated;
    });
  }

  /**
   * One side confirms: the stylist that payment was received, the client that
   * the job was done. The second confirmation completes the booking.
   */
  async confirm(bookingId: string, side: Side): Promise<Booking> {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, bookingId);
      const current = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
      if (current.status === 'completed') return current;
      if (current.status !== 'confirmed') {
        throw new BadRequestException(
          `Cannot confirm completion for a booking in status "${current.status}"`,
        );
      }
      const already = side === 'client' ? current.confirmedByClient : current.confirmedByProvider;
      if (already) return current;

      // Bookings paid in the app before direct payment existed: the client's
      // word releases the escrow, so it needs a payment that has cleared, and
      // the stylist's confirmation is only recorded.
      const legacyOnline = current.paymentMethod === 'ecocash';
      if (legacyOnline && side === 'client') {
        const funded = await tx.payment.findFirst({
          where: { bookingId, status: { in: ['paid', 'held'] } },
        });
        if (!funded) throw new BadRequestException('Payment has not cleared yet');
      }

      const now = new Date();
      const confirmed = await tx.booking.update({
        where: { id: bookingId },
        data:
          side === 'client'
            ? { confirmedByClient: true, confirmedByClientAt: now }
            : { confirmedByProvider: true, confirmedByProviderAt: now },
      });
      const completes = legacyOnline
        ? side === 'client'
        : confirmed.confirmedByClient && confirmed.confirmedByProvider;
      return completes ? this.complete(tx, confirmed, { auto: false }) : confirmed;
    });
  }

  /**
   * Completes bookings where only one side confirmed and the window passed,
   * and marks incomplete those neither side confirmed. Safe to run twice or
   * from two instances at once: each booking is re-checked under its lock and
   * changes only once. Returns how many it changed.
   */
  async autoCompleteDue(now: Date = new Date()): Promise<number> {
    const hours = await this.setting('completionAutoConfirmHours');
    const cutoff = new Date(now.getTime() - hours * 60 * 60_000);
    // The window starts at the later of the confirmation and the end of the
    // appointment, so a confirmation made ahead of time cannot complete a
    // job that has not happened yet.
    const candidates = await this.prisma.booking.findMany({
      where: {
        status: 'confirmed',
        paymentMethod: 'cash',
        nonPaymentReportedAt: null,
        endsAt: { lte: cutoff },
        OR: [
          {
            confirmedByClient: true,
            confirmedByProvider: false,
            confirmedByClientAt: { lte: cutoff },
          },
          {
            confirmedByProvider: true,
            confirmedByClient: false,
            confirmedByProviderAt: { lte: cutoff },
          },
        ],
      },
      select: { id: true },
      take: 200,
    });

    let completed = 0;
    for (const { id } of candidates) {
      const done = await this.prisma.$transaction(async (tx) => {
        await this.lock(tx, id);
        const current = await tx.booking.findUniqueOrThrow({ where: { id } });
        const confirmedAt = current.confirmedByClient
          ? current.confirmedByClientAt
          : current.confirmedByProviderAt;
        const oneSided = current.confirmedByClient !== current.confirmedByProvider;
        if (
          current.status !== 'confirmed' ||
          current.nonPaymentReportedAt ||
          !oneSided ||
          !confirmedAt ||
          confirmedAt > cutoff ||
          current.endsAt > cutoff
        ) {
          return false;
        }
        await this.complete(tx, current, { auto: true });
        return true;
      });
      if (!done) continue;
      completed += 1;
      await this.notifyCompleted(id).catch((error: unknown) => {
        this.logger.error(`Couldn't notify about auto-completed booking ${id}`, error);
      });
    }
    return completed + (await this.markUnconfirmedIncomplete(cutoff));
  }

  /**
   * Bookings neither side confirmed within the window after the appointment
   * ended become `incomplete`: nothing shows the job happened, so no fee is
   * charged, no coins are earned, and coins the client used are returned.
   * Re-checked under each booking's lock, so running twice changes nothing.
   */
  private async markUnconfirmedIncomplete(cutoff: Date): Promise<number> {
    const candidates = await this.prisma.booking.findMany({
      where: {
        status: 'confirmed',
        paymentMethod: 'cash',
        nonPaymentReportedAt: null,
        confirmedByClient: false,
        confirmedByProvider: false,
        endsAt: { lte: cutoff },
      },
      select: { id: true },
      take: 200,
    });
    let marked = 0;
    for (const { id } of candidates) {
      const changed = await this.prisma.$transaction(async (tx) => {
        await this.lock(tx, id);
        const current = await tx.booking.findUniqueOrThrow({ where: { id } });
        if (
          current.status !== 'confirmed' ||
          current.confirmedByClient ||
          current.confirmedByProvider ||
          current.endsAt > cutoff
        ) {
          return false;
        }
        await tx.booking.update({ where: { id }, data: { status: 'incomplete' } });
        if (current.coinsUsed > 0) await this.rewards.refundRedemption(tx, { bookingId: id });
        return true;
      });
      if (!changed) continue;
      marked += 1;
      await this.notifyIncomplete(id).catch((error: unknown) => {
        this.logger.error(`Couldn't notify about incomplete booking ${id}`, error);
      });
    }
    return marked;
  }

  private async notifyIncomplete(bookingId: string): Promise<void> {
    const booking = await this.prisma.booking.findUniqueOrThrow({
      where: { id: bookingId },
      include: { provider: true, service: true },
    });
    const row = toBookingRowDto(booking, false);
    this.socketEmitter.emitToUser(booking.clientId, 'booking.updated', row);
    this.socketEmitter.emitToUser(booking.provider.userId, 'booking.updated', row);
    const data = { type: 'booking.updated', bookingId };
    const body = `${booking.provider.displayName} · ${booking.service.name}: nobody confirmed it was done`;
    void this.push.sendToUser(booking.clientId, { title: 'Booking marked incomplete', body, data });
    void this.push.sendToUser(booking.provider.userId, {
      title: 'Booking marked incomplete',
      body: `Booking ${booking.reference}: nobody confirmed it was done`,
      data: { ...data, audience: 'provider' },
    });
  }

  /**
   * The stylist says the client did not pay. Allowed from the appointment
   * start until `nonPaymentReportHours` after it. The booking becomes
   * `incomplete`, not completed: no fee is owed (one already charged is
   * waived), the coins the client earned on it are taken back, and it no
   * longer counts towards the stylist's completed jobs.
   */
  async reportNonPayment(bookingId: string, providerId: string, note?: string): Promise<Booking> {
    const hours = await this.setting('nonPaymentReportHours');
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, bookingId);
      const current = await this.requireOwn(tx, bookingId, providerId);
      // A repeat is a retry, not a second report.
      if (current.nonPaymentReportedAt) return current;
      const allowed = canReportNonPayment(
        {
          paymentMethod: current.paymentMethod,
          status: current.status,
          startsAtIso: current.startsAt.toISOString(),
          alreadyReported: false,
        },
        hours,
      );
      if (!allowed) {
        const direct = current.paymentMethod === 'cash';
        const live = current.status === 'confirmed' || current.status === 'completed';
        throw new BadRequestException(
          direct && live
            ? new Date() < current.startsAt
              ? 'You can report non-payment once the appointment has started'
              : `The ${String(hours)} hours for reporting non-payment have passed`
            : 'Non-payment cannot be reported for this booking',
        );
      }

      const wasCompleted = current.status === 'completed';
      const reported = await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: 'incomplete',
          nonPaymentReportedAt: new Date(),
          nonPaymentNote: note?.trim() ? note.trim() : null,
        },
      });
      if (wasCompleted) {
        await this.fees.waive(tx, { bookingId }, 'Stylist reported the client did not pay');
        await this.rewards.reverseBookingReward(tx, { bookingId });
        await tx.providerProfile.update({
          where: { id: current.providerId },
          data: { completedCount: { decrement: 1 } },
        });
        // The cash "released" row written on completion is reversed, so
        // earnings and exports don't count money the stylist never received.
        await tx.payment.create({
          data: {
            bookingId,
            provider: 'cash',
            status: 'refunded',
            amountUsdCents: current.priceUsdCents,
          },
        });
      }
      return reported;
    });
  }

  /** Both sides' live view and a notification, after an automatic completion. */
  private async notifyCompleted(bookingId: string): Promise<void> {
    const booking = await this.prisma.booking.findUniqueOrThrow({
      where: { id: bookingId },
      include: { provider: true, service: true },
    });
    const rated = await this.prisma.review.findFirst({
      where: { bookingId, raterId: booking.clientId },
      select: { id: true },
    });
    const row = toBookingRowDto(booking, !!rated);
    this.socketEmitter.emitToUser(booking.clientId, 'booking.updated', row);
    this.socketEmitter.emitToUser(booking.provider.userId, 'booking.updated', row);
    const data = { type: 'booking.updated', bookingId };
    void this.push.sendToUser(booking.clientId, {
      title: 'Booking completed',
      body: `${booking.provider.displayName} · ${booking.service.name}`,
      data,
    });
    void this.push.sendToUser(booking.provider.userId, {
      title: 'Booking completed',
      body: `Booking ${booking.reference} was completed automatically`,
      data: { ...data, audience: 'provider' },
    });
  }

  /**
   * The one place a booking becomes `completed`, inside the caller's
   * transaction so the fee and coins are recorded if and only if the status
   * change commits. Callers hold the booking's lock.
   */
  private async complete(
    tx: Prisma.TransactionClient,
    current: Booking,
    opts: { auto: boolean },
  ): Promise<Booking> {
    const done = await tx.booking.update({
      where: { id: current.id },
      data: { status: 'completed', completedAt: new Date(), autoCompleted: opts.auto },
    });
    await tx.providerProfile.update({
      where: { id: current.providerId },
      data: { completedCount: { increment: 1 } },
    });

    if (current.paymentMethod === 'ecocash') {
      // Paid in the app before direct payment existed: release the escrow.
      // No fee was added to these, so none is charged.
      const funded = await tx.payment.findFirst({
        where: { bookingId: current.id, status: { in: ['paid', 'held'] } },
        orderBy: { createdAt: 'desc' },
      });
      if (funded) {
        await tx.payment.create({
          data: {
            bookingId: current.id,
            provider: funded.provider,
            status: 'released',
            amountUsdCents: funded.amountUsdCents,
            feeUsdCents: funded.feeUsdCents,
            externalRef: funded.externalRef,
          },
        });
      }
    } else if (!current.nonPaymentReportedAt) {
      await tx.payment.create({
        data: {
          bookingId: current.id,
          provider: 'cash',
          status: 'released',
          amountUsdCents: current.priceUsdCents,
        },
      });
      // The fee is on the stylist's price, not the client's total. A job the
      // stylist reported as unpaid owes none and earns no coins.
      await this.fees.chargeBooking(tx, {
        providerId: current.providerId,
        bookingId: current.id,
        priceUsdCents: current.priceUsdCents,
        // The rate frozen when the booking was made, so the fee matches the
        // total the client was shown even if the setting changed since.
        rateBps: current.serviceFeeBps,
      });
      const { amountDueUsdCents } = bookingAmounts(current);
      await this.rewards.onBookingCompleted(tx, {
        bookingId: current.id,
        clientId: current.clientId,
        amountPaidUsdCents: amountDueUsdCents,
      });
    }

    // Recruitment rewards no longer depend on bookings: an agent's recruiter
    // is paid when the recruit is verified and has paid their first
    // subscription (rewards/recruitment.ts).
    return done;
  }

  private async requireOwn(
    tx: Prisma.TransactionClient,
    bookingId: string,
    providerId: string,
  ): Promise<Booking> {
    const booking = await tx.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.providerId !== providerId) throw new ForbiddenException();
    return booking;
  }

  private async lock(tx: Prisma.TransactionClient, bookingId: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${bookingId}))`;
  }

  private setting<K extends 'completionAutoConfirmHours' | 'nonPaymentReportHours'>(key: K) {
    return (this.settings ?? settingsFor(this.prisma)).get(key);
  }
}

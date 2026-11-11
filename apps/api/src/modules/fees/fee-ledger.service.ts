import { Injectable, Optional } from '@nestjs/common';
import { feeCents } from '@sc/shared';
import type { FeeLedgerEntry, Prisma } from '../../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService, settingsFor } from '../settings/settings.service';

type Db = PrismaService | Prisma.TransactionClient;

/**
 * The running balance each stylist or vendor owes StylistsCenter
 * (FeeLedgerEntry). Every write is idempotent per booking/order: calling a
 * charge twice, or from two racing requests, records it once.
 *
 * Pass the transaction (`tx`) that changes the booking or order, so the fee
 * is recorded if and only if that change commits.
 */
@Injectable()
export class FeeLedgerService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly settings?: SettingsService,
  ) {}

  /**
   * Service fee on a completed booking: `priceUsdCents` is the stylist's
   * price (without the fee). Returns the fee recorded, 0 if the rate is 0,
   * or null if this booking was already charged.
   */
  async chargeBooking(
    db: Db,
    input: { providerId: string; bookingId: string; priceUsdCents: number },
  ): Promise<number | null> {
    const rateBps = await this.rate('serviceFeeBps');
    return this.charge(db, {
      kind: 'booking_fee',
      providerId: input.providerId,
      bookingId: input.bookingId,
      baseUsdCents: input.priceUsdCents,
      rateBps,
    });
  }

  /**
   * Commission on a delivered or collected order: `productTotalUsdCents`
   * excludes any delivery charge.
   */
  async chargeOrder(
    db: Db,
    input: { providerId: string; orderId: string; productTotalUsdCents: number },
  ): Promise<number | null> {
    const rateBps = await this.rate('marketplaceFeeBps');
    return this.charge(db, {
      kind: 'order_fee',
      providerId: input.providerId,
      orderId: input.orderId,
      baseUsdCents: input.productTotalUsdCents,
      rateBps,
    });
  }

  /**
   * Takes back the fee charged on a booking or order (reported non-payment,
   * cancellation after charging). No-op if nothing was charged or it was
   * already waived. Returns the amount waived.
   */
  async waive(
    db: Db,
    ref: { bookingId: string } | { orderId: string },
    note: string,
  ): Promise<number> {
    const kind = 'bookingId' in ref ? 'booking_fee' : 'order_fee';
    const charged = await db.feeLedgerEntry.findFirst({ where: { kind, ...ref } });
    if (!charged || charged.amountUsdCents === 0) return 0;
    // ON CONFLICT DO NOTHING rather than catching a unique violation: a
    // failed insert would abort the caller's whole transaction.
    const { count } = await db.feeLedgerEntry.createMany({
      data: [
        {
          providerId: charged.providerId,
          kind: 'waiver',
          amountUsdCents: -charged.amountUsdCents,
          baseUsdCents: charged.baseUsdCents,
          rateBps: charged.rateBps,
          ...ref,
          note,
        },
      ],
      skipDuplicates: true,
    });
    return count === 1 ? charged.amountUsdCents : 0;
  }

  /** A payment towards the balance (positive amount paid). */
  async recordPayment(
    db: Db,
    input: {
      providerId: string;
      amountUsdCents: number;
      paymentId?: string;
      note?: string;
      createdByAdminId?: string;
    },
  ): Promise<FeeLedgerEntry> {
    return db.feeLedgerEntry.create({
      data: {
        providerId: input.providerId,
        kind: 'payment',
        amountUsdCents: -Math.abs(input.amountUsdCents),
        paymentId: input.paymentId ?? null,
        note: input.note ?? null,
        createdByAdminId: input.createdByAdminId ?? null,
      },
    });
  }

  /**
   * A manual correction by staff. Signed: positive adds to what is owed,
   * negative reduces it. The note is required so the ledger says why.
   */
  async recordAdjustment(
    db: Db,
    input: { providerId: string; amountUsdCents: number; note: string; createdByAdminId?: string },
  ): Promise<FeeLedgerEntry> {
    return db.feeLedgerEntry.create({
      data: {
        providerId: input.providerId,
        kind: 'adjustment',
        amountUsdCents: input.amountUsdCents,
        note: input.note,
        createdByAdminId: input.createdByAdminId ?? null,
      },
    });
  }

  /** Owed now: positive means the provider owes StylistsCenter. */
  async balance(providerId: string, db: Db = this.prisma): Promise<number> {
    const agg = await db.feeLedgerEntry.aggregate({
      where: { providerId },
      _sum: { amountUsdCents: true },
    });
    return agg._sum.amountUsdCents ?? 0;
  }

  /** Entries in a period, oldest first, for statements. */
  async entries(
    providerId: string,
    range: { from?: Date; to?: Date } = {},
    db: Db = this.prisma,
  ): Promise<FeeLedgerEntry[]> {
    return db.feeLedgerEntry.findMany({
      where: {
        providerId,
        createdAt: {
          ...(range.from ? { gte: range.from } : {}),
          ...(range.to ? { lt: range.to } : {}),
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async charge(
    db: Db,
    input: {
      kind: 'booking_fee' | 'order_fee';
      providerId: string;
      bookingId?: string;
      orderId?: string;
      baseUsdCents: number;
      rateBps: number;
    },
  ): Promise<number | null> {
    const amount = feeCents(input.baseUsdCents, input.rateBps);
    // A zero fee is still recorded, so statements list every job. ON
    // CONFLICT DO NOTHING keeps a repeat charge from aborting the caller's
    // transaction.
    const { count } = await db.feeLedgerEntry.createMany({
      data: [
        {
          providerId: input.providerId,
          kind: input.kind,
          amountUsdCents: amount,
          baseUsdCents: input.baseUsdCents,
          rateBps: input.rateBps,
          bookingId: input.bookingId ?? null,
          orderId: input.orderId ?? null,
        },
      ],
      skipDuplicates: true,
    });
    return count === 1 ? amount : null;
  }

  private async rate(key: 'serviceFeeBps' | 'marketplaceFeeBps'): Promise<number> {
    return (this.settings ?? settingsFor(this.prisma)).get(key);
  }
}

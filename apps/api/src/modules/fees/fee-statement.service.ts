import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService, settingsFor } from '../settings/settings.service';
import { harareMonthKey, harareMonthStart, nextMonthKey, statementDueAt } from './fee-periods';

/**
 * Month-end statements. A statement is a snapshot of the ledger for one
 * Harare calendar month, written once and never recalculated: the due date
 * and every figure are stored, so changing a setting or correcting the
 * ledger later cannot rewrite what a stylist was already shown.
 *
 * Generation is idempotent (unique per provider and month) and catches up:
 * every month with ledger activity that ended before now and has no
 * statement gets one, so a missed job run, or a long outage, loses nothing.
 */
@Injectable()
export class FeeStatementService {
  private readonly logger = new Logger(FeeStatementService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly settings?: SettingsService,
  ) {}

  /** Creates every missing statement for a finished month. Returns how many were created. */
  async generateMissing(now: Date = new Date()): Promise<number> {
    const thisMonth = harareMonthKey(now);
    const [active, existing] = await Promise.all([
      this.prisma.$queryRaw<{ providerId: string; month: string }[]>`
        SELECT DISTINCT e."providerId",
               -- createdAt is a UTC timestamp without a zone: say so before converting.
               to_char((e."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Harare', 'YYYY-MM') AS month
        FROM "FeeLedgerEntry" e
        WHERE e."createdAt" < ${harareMonthStart(thisMonth)}
      `,
      this.prisma.feeStatement.findMany({ select: { providerId: true, month: true } }),
    ]);
    const have = new Set(existing.map((s) => `${s.providerId}|${s.month}`));
    const dueDay = await (this.settings ?? settingsFor(this.prisma)).get('billingDueDay');

    let created = 0;
    for (const { providerId, month } of active) {
      if (have.has(`${providerId}|${month}`)) continue;
      try {
        if (await this.generate(providerId, month, dueDay)) created += 1;
      } catch (error) {
        // One provider's failure must not stop everyone else's statement.
        this.logger.error(`Couldn't generate ${month} statement for ${providerId}`, error);
      }
    }
    return created;
  }

  /**
   * One provider's statement for a finished month. Returns false when it
   * already existed (a concurrent run or an earlier one got there first).
   */
  async generate(providerId: string, month: string, dueDay: number): Promise<boolean> {
    const periodStart = harareMonthStart(month);
    const periodEnd = harareMonthStart(nextMonthKey(month));

    return this.prisma.$transaction(async (tx) => {
      const [opening, inPeriod] = await Promise.all([
        tx.feeLedgerEntry.aggregate({
          where: { providerId, createdAt: { lt: periodStart } },
          _sum: { amountUsdCents: true },
        }),
        tx.feeLedgerEntry.groupBy({
          by: ['kind'],
          where: { providerId, createdAt: { gte: periodStart, lt: periodEnd } },
          _sum: { amountUsdCents: true },
        }),
      ]);
      const sum = (kind: string): number =>
        inPeriod.find((row) => row.kind === kind)?._sum.amountUsdCents ?? 0;

      const openingUsdCents = opening._sum.amountUsdCents ?? 0;
      const bookingFeesUsdCents = sum('booking_fee');
      const orderFeesUsdCents = sum('order_fee');
      const waiversUsdCents = -sum('waiver');
      const paymentsUsdCents = -sum('payment');
      const adjustmentsUsdCents = sum('adjustment');
      const closingUsdCents =
        openingUsdCents +
        bookingFeesUsdCents +
        orderFeesUsdCents -
        waiversUsdCents -
        paymentsUsdCents +
        adjustmentsUsdCents;

      // ON CONFLICT DO NOTHING: two job runs racing must not fail one of them.
      const { count } = await tx.feeStatement.createMany({
        data: [
          {
            providerId,
            month,
            periodStart,
            periodEnd,
            openingUsdCents,
            bookingFeesUsdCents,
            orderFeesUsdCents,
            waiversUsdCents,
            paymentsUsdCents,
            adjustmentsUsdCents,
            closingUsdCents,
            dueAt: statementDueAt(month, dueDay),
          },
        ],
        skipDuplicates: true,
      });
      return count === 1;
    });
  }

  list(providerId: string, take = 24) {
    return this.prisma.feeStatement.findMany({
      where: { providerId },
      orderBy: { periodStart: 'desc' },
      take,
    });
  }
}

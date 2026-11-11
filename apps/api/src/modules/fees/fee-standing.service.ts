import { ForbiddenException, Injectable, Optional } from '@nestjs/common';
import { Prisma } from '../../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService, settingsFor } from '../settings/settings.service';
import { DAY_MS } from './fee-periods';

export const FEES_UNPAID_MESSAGE = 'Your account is paused until your StylistsCenter fees are paid';

/** A statement whose closing balance has not been covered by payments since it was issued. */
export interface UnpaidStatement {
  statementId: string;
  providerId: string;
  month: string;
  dueAt: Date;
  closingUsdCents: number;
  unpaidUsdCents: number;
}

export interface FeeStanding {
  /** Past its due date and still unpaid. */
  overdueUsdCents: number;
  /** Unpaid `feeRestrictAfterDays` after the due date: no new bookings or sales. */
  restricted: boolean;
}

/**
 * Whether a stylist or vendor may take new bookings or sales, given their
 * fee statements. A provider is restricted once any statement is still
 * unpaid `feeRestrictAfterDays` after its due date.
 *
 * "Unpaid" means the payments made since the statement was issued do not
 * cover its closing balance (a negative adjustment by staff counts as a
 * payment; a waiver does not, because a waiver of a job from a later month
 * must not clear an earlier month's debt). The amount is also capped at the
 * balance owed now, so a provider whose fees were since waived or credited
 * is never held for money they no longer owe.
 *
 * Bookings and the marketplace call `assertCanTrade` before accepting a new
 * booking or order; search, smart match and the public page use
 * `restrictedProviderIds`.
 */
@Injectable()
export class FeeStandingService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly settings?: SettingsService,
  ) {}

  /** Throws a ForbiddenException with a user-facing message when restricted. */
  async assertCanTrade(providerId: string, now: Date = new Date()): Promise<void> {
    if ((await this.standing([providerId], now)).get(providerId)?.restricted) {
      throw new ForbiddenException(FEES_UNPAID_MESSAGE);
    }
  }

  async isRestricted(providerId: string, now: Date = new Date()): Promise<boolean> {
    return (await this.standing([providerId], now)).get(providerId)?.restricted ?? false;
  }

  /** For listings: providers to hide from search and smart match. */
  async restrictedProviderIds(now: Date = new Date()): Promise<string[]> {
    const all = await this.standing(undefined, now);
    return [...all].filter(([, standing]) => standing.restricted).map(([id]) => id);
  }

  /**
   * Standing for the given providers (or every provider with an unpaid
   * statement). Providers in good standing are absent from the map.
   */
  async standing(
    providerIds: string[] | undefined,
    now: Date = new Date(),
  ): Promise<Map<string, FeeStanding>> {
    const restrictAfterMs =
      (await (this.settings ?? settingsFor(this.prisma)).get('feeRestrictAfterDays')) * DAY_MS;
    const rows = await this.unpaidStatements(providerIds);
    const owing = [...new Set(rows.map((r) => r.providerId))];
    const balances = new Map(
      (
        await this.prisma.feeLedgerEntry.groupBy({
          by: ['providerId'],
          where: { providerId: { in: owing } },
          _sum: { amountUsdCents: true },
        })
      ).map((b) => [b.providerId, b._sum.amountUsdCents ?? 0]),
    );

    const out = new Map<string, FeeStanding>();
    for (const row of rows) {
      const owed = Math.min(row.unpaidUsdCents, balances.get(row.providerId) ?? 0);
      if (owed <= 0 || row.dueAt.getTime() > now.getTime()) continue;
      const current = out.get(row.providerId) ?? { overdueUsdCents: 0, restricted: false };
      current.overdueUsdCents = Math.max(current.overdueUsdCents, owed);
      if (row.dueAt.getTime() + restrictAfterMs <= now.getTime()) current.restricted = true;
      out.set(row.providerId, current);
    }
    return out;
  }

  /** Every statement (due or not) with money still unpaid, for restriction and reminders. */
  async unpaidStatements(providerIds?: string[]): Promise<UnpaidStatement[]> {
    const only =
      providerIds === undefined
        ? Prisma.empty
        : providerIds.length === 0
          ? Prisma.sql`AND false`
          : Prisma.sql`AND s."providerId" IN (${Prisma.join(providerIds)})`;
    return this.prisma.$queryRaw<UnpaidStatement[]>`
      SELECT s.id AS "statementId", s."providerId", s.month, s."dueAt", s."closingUsdCents",
             (s."closingUsdCents" - COALESCE(c.credited, 0))::int AS "unpaidUsdCents"
      FROM "FeeStatement" s
      LEFT JOIN LATERAL (
        SELECT SUM(-e."amountUsdCents") AS credited
        FROM "FeeLedgerEntry" e
        WHERE e."providerId" = s."providerId"
          AND e."createdAt" >= s."periodEnd"
          AND (e.kind = 'payment' OR (e.kind = 'adjustment' AND e."amountUsdCents" < 0))
      ) c ON true
      WHERE s."closingUsdCents" > 0
        AND s."closingUsdCents" > COALESCE(c.credited, 0)
        ${only}
      ORDER BY s."dueAt"
    `;
  }
}

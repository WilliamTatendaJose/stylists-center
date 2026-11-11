import { Injectable, NotFoundException } from '@nestjs/common';
import {
  formatUsd,
  type AdjustFeesInput,
  type AdminFeeDetailDto,
  type AdminFeeRowDto,
  type AdminFeeSummaryDto,
  type Paged,
  type RecordFeePaymentInput,
} from '@sc/shared';
import type { Prisma } from '../../generated/prisma';
import { toCsv, usd } from '../../common/csv';
import { pageArray, type PageRequest } from '../../common/paging';
import { PrismaService } from '../prisma/prisma.service';
import { FeeLedgerService } from './fee-ledger.service';
import { FeeStandingService } from './fee-standing.service';
import { FeesService } from './fees.service';

const METHOD_LABELS = { cash: 'Cash', bank: 'Bank transfer', other: 'Other' } as const;

/** How many ledger entries the detail page shows; older ones are on the statements. */
const DETAIL_ENTRY_LIMIT = 200;

export type FeeListFilter = 'owing' | 'overdue' | 'restricted';

/**
 * The finance team's view of fee balances: who owes what, who is restricted,
 * and the two things staff can do by hand: record a payment made outside the
 * app and adjust a balance. Both go through FeeLedgerService, are tied to the
 * admin who made them, and write an audit row in the same transaction.
 */
@Injectable()
export class AdminFeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: FeeLedgerService,
    private readonly standing: FeeStandingService,
    private readonly fees: FeesService,
  ) {}

  async summary(): Promise<AdminFeeSummaryDto> {
    const rows = await this.allRows();
    return {
      owedUsdCents: rows.reduce((sum, r) => sum + Math.max(0, r.balanceUsdCents), 0),
      overdueUsdCents: rows.reduce((sum, r) => sum + r.overdueUsdCents, 0),
      providersOwing: rows.filter((r) => r.balanceUsdCents > 0).length,
      restrictedCount: rows.filter((r) => r.restricted).length,
    };
  }

  async list(input: {
    q?: string | undefined;
    filter?: FeeListFilter | undefined;
    page: PageRequest;
  }): Promise<Paged<AdminFeeRowDto>> {
    const rows = (await this.allRows(input.q)).filter((r) => {
      if (input.filter === 'owing') return r.balanceUsdCents > 0;
      if (input.filter === 'overdue') return r.overdueUsdCents > 0;
      if (input.filter === 'restricted') return r.restricted;
      return true;
    });
    // Worst first: restricted, then most overdue, then biggest balance.
    rows.sort(
      (a, b) =>
        Number(b.restricted) - Number(a.restricted) ||
        b.overdueUsdCents - a.overdueUsdCents ||
        b.balanceUsdCents - a.balanceUsdCents ||
        a.displayName.localeCompare(b.displayName),
    );
    return pageArray(rows, input.page);
  }

  async detail(providerId: string): Promise<AdminFeeDetailDto> {
    const [provider] = await this.rowsFor({ id: providerId });
    if (!provider) throw new NotFoundException('Provider not found');
    const [statements, entries] = await Promise.all([
      this.fees.listStatements(providerId),
      this.prisma.feeLedgerEntry.findMany({
        where: { providerId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: DETAIL_ENTRY_LIMIT,
      }),
    ]);
    return { provider, statements, entries: await this.fees.toEntryDtos(entries) };
  }

  /** A payment made outside the app (cash, bank). Reduces the balance and is logged against the admin. */
  async recordPayment(
    adminId: string,
    providerId: string,
    input: RecordFeePaymentInput,
  ): Promise<AdminFeeDetailDto> {
    await this.assertProvider(providerId);
    await this.prisma.$transaction(async (tx) => {
      await this.ledger.recordPayment(tx, {
        providerId,
        amountUsdCents: input.amountUsdCents,
        note: `${METHOD_LABELS[input.method]}: ${input.note}`,
        createdByAdminId: adminId,
      });
      await tx.auditLog.create({
        data: {
          adminActorId: adminId,
          action: `FEES payment ${formatUsd(input.amountUsdCents)} (${input.method}): ${input.note}`,
          targetType: 'ProviderProfile',
          targetId: providerId,
        },
      });
    });
    return this.detail(providerId);
  }

  async adjust(
    adminId: string,
    providerId: string,
    input: AdjustFeesInput,
  ): Promise<AdminFeeDetailDto> {
    await this.assertProvider(providerId);
    await this.prisma.$transaction(async (tx) => {
      await this.ledger.recordAdjustment(tx, {
        providerId,
        amountUsdCents: input.amountUsdCents,
        note: input.note,
        createdByAdminId: adminId,
      });
      await tx.auditLog.create({
        data: {
          adminActorId: adminId,
          action: `FEES adjustment ${formatUsd(input.amountUsdCents)}: ${input.note}`,
          targetType: 'ProviderProfile',
          targetId: providerId,
        },
      });
    });
    return this.detail(providerId);
  }

  async csv(): Promise<string> {
    const rows = await this.allRows();
    return toCsv(
      ['Provider', 'Phone', 'Balance (USD)', 'Overdue (USD)', 'Restricted', 'Last payment'],
      rows.map((r) => [
        r.displayName,
        r.phone,
        usd(r.balanceUsdCents),
        usd(r.overdueUsdCents),
        r.restricted ? 'Yes' : 'No',
        r.lastPaymentAt ?? '',
      ]),
    );
  }

  private async assertProvider(providerId: string): Promise<void> {
    const found = await this.prisma.providerProfile.findUnique({
      where: { id: providerId },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Provider not found');
  }

  private allRows(q?: string): Promise<AdminFeeRowDto[]> {
    return this.rowsFor(
      q
        ? {
            OR: [
              { displayName: { contains: q, mode: 'insensitive' } },
              { user: { phone: { contains: q } } },
            ],
          }
        : {},
    );
  }

  /** Every provider with any ledger activity (matching `where`), with balance and standing. */
  private async rowsFor(where: Prisma.ProviderProfileWhereInput): Promise<AdminFeeRowDto[]> {
    const [balances, standing, lastPayments] = await Promise.all([
      this.prisma.feeLedgerEntry.groupBy({
        by: ['providerId'],
        _sum: { amountUsdCents: true },
      }),
      this.standing.standing(undefined),
      this.prisma.$queryRaw<{ providerId: string; createdAt: Date; amountUsdCents: number }[]>`
        SELECT DISTINCT ON ("providerId") "providerId", "createdAt", "amountUsdCents"
        FROM "FeeLedgerEntry" WHERE kind = 'payment'
        ORDER BY "providerId", "createdAt" DESC
      `,
    ]);
    const balanceById = new Map(balances.map((b) => [b.providerId, b._sum.amountUsdCents ?? 0]));
    const lastById = new Map(lastPayments.map((p) => [p.providerId, p]));
    const providers = await this.prisma.providerProfile.findMany({
      where: { AND: [where, { id: { in: [...balanceById.keys()] } }] },
      select: { id: true, displayName: true, user: { select: { phone: true } } },
    });
    return providers.map((p) => {
      const last = lastById.get(p.id);
      return {
        providerId: p.id,
        displayName: p.displayName,
        phone: p.user.phone,
        balanceUsdCents: balanceById.get(p.id) ?? 0,
        overdueUsdCents: standing.get(p.id)?.overdueUsdCents ?? 0,
        restricted: standing.get(p.id)?.restricted ?? false,
        lastPaymentAt: last?.createdAt.toISOString() ?? null,
        // Payments are stored negative; show what was paid.
        lastPaymentUsdCents: last ? -last.amountUsdCents : null,
      };
    });
  }
}

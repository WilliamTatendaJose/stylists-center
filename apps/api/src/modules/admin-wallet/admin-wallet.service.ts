import { BadRequestException, Injectable } from '@nestjs/common';
import {
  isSubscriptionActive,
  type AdminAgentRowDto,
  type AdminCashOutRowDto,
  type RecordCashOutSettlementInput,
} from '@sc/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { Paged } from '@sc/shared';
import type { Prisma } from '../../generated/prisma';
import { toPage, type PageRequest } from '../../common/paging';

/**
 * `WalletTransaction.type = 'cash_out'` already debited the coin ledger the
 * moment a stylist requested it — nothing in this codebase moves real money
 * to them (see WalletService.cashOut). This service gives admins visibility
 * into cash-out requests and a way to record that a real-world transfer
 * happened, via the separate append-only CashOutSettlement table. It never
 * writes to WalletTransaction.
 */
@Injectable()
export class AdminWalletService {
  constructor(private readonly prisma: PrismaService) {}

  async listCashOuts(input: {
    q?: string | undefined;
    page: PageRequest;
  }): Promise<Paged<AdminCashOutRowDto>> {
    const where: Prisma.WalletTransactionWhereInput = {
      type: 'cash_out',
      ...(input.q
        ? {
            user: {
              OR: [
                { displayName: { contains: input.q, mode: 'insensitive' } },
                { phone: { contains: input.q } },
              ],
            },
          }
        : {}),
    };
    const [transactions, total] = await this.prisma.$transaction([
      this.prisma.walletTransaction.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: {
          user: { select: { displayName: true, phone: true } },
          cashOutSettlement: true,
        },
        take: input.page.limit,
        skip: input.page.offset,
      }),
      this.prisma.walletTransaction.count({ where }),
    ]);
    return toPage(transactions.map(toCashOutRow), total, input.page);
  }

  /** Agents with their subscription status, newest first. `status` narrows to active or lapsed subscriptions. */
  async listAgents(input: {
    q?: string | undefined;
    subscription?: 'active' | 'lapsed' | undefined;
    page: PageRequest;
  }): Promise<Paged<AdminAgentRowDto>> {
    const now = new Date();
    const where: Prisma.AgentWhereInput = {
      ...(input.q
        ? {
            user: {
              OR: [
                { displayName: { contains: input.q, mode: 'insensitive' } },
                { phone: { contains: input.q } },
              ],
            },
          }
        : {}),
      ...(input.subscription === 'active'
        ? { subscriptionPaidUntil: { gt: now } }
        : input.subscription === 'lapsed'
          ? { OR: [{ subscriptionPaidUntil: null }, { subscriptionPaidUntil: { lte: now } }] }
          : {}),
    };
    const [agents, total] = await this.prisma.$transaction([
      this.prisma.agent.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: { user: { select: { displayName: true, phone: true } } },
        take: input.page.limit,
        skip: input.page.offset,
      }),
      this.prisma.agent.count({ where }),
    ]);
    const sums = await this.prisma.walletTransaction.groupBy({
      by: ['userId'],
      where: { pool: 'agent', userId: { in: agents.map((a) => a.userId) } },
      _sum: { coins: true },
    });
    const coinsByUser = new Map(sums.map((s) => [s.userId, s._sum.coins ?? 0]));
    return toPage(
      agents.map((agent) => ({
        agentId: agent.id,
        userId: agent.userId,
        displayName: agent.user.displayName,
        phone: agent.user.phone,
        referralCode: agent.referralCode,
        verificationStatus: agent.verificationStatus,
        status: agent.status,
        subscriptionPaidUntil: agent.subscriptionPaidUntil?.toISOString() ?? null,
        subscriptionActive: isSubscriptionActive(
          agent.subscriptionPaidUntil?.toISOString() ?? null,
          now.getTime(),
        ),
        agentCoins: Math.max(0, coinsByUser.get(agent.userId) ?? 0),
      })),
      total,
      input.page,
    );
  }

  async settleCashOut(
    transactionId: string,
    input: RecordCashOutSettlementInput,
  ): Promise<AdminCashOutRowDto> {
    const transaction = await this.prisma.walletTransaction.findUniqueOrThrow({
      where: { id: transactionId },
      include: {
        user: { select: { displayName: true, phone: true } },
        cashOutSettlement: true,
      },
    });
    if (transaction.type !== 'cash_out') {
      throw new BadRequestException('Not a cash-out transaction');
    }
    if (transaction.cashOutSettlement) {
      throw new BadRequestException('This cash-out is already settled');
    }

    const settlement = await this.prisma.cashOutSettlement.create({
      data: { walletTransactionId: transactionId, note: input.note ?? null },
    });
    return toCashOutRow({ ...transaction, cashOutSettlement: settlement });
  }
}

function toCashOutRow(transaction: {
  id: string;
  userId: string;
  user: { displayName: string; phone: string | null };
  coins: number;
  usdCents: number;
  pool: 'spend' | 'cash' | 'agent';
  createdAt: Date;
  cashOutSettlement: { note: string | null; createdAt: Date } | null;
}): AdminCashOutRowDto {
  return {
    transactionId: transaction.id,
    userId: transaction.userId,
    displayName: transaction.user.displayName,
    phone: transaction.user.phone,
    // Cash-out rows are stored negative (a debit) — the admin view is the positive amount requested.
    amountUsdCents: -transaction.usdCents,
    coins: -transaction.coins,
    coinType: transaction.pool === 'agent' ? 'agent' : 'cash',
    requestedAt: transaction.createdAt.toISOString(),
    settled: !!transaction.cashOutSettlement,
    settledAt: transaction.cashOutSettlement?.createdAt.toISOString() ?? null,
    settledNote: transaction.cashOutSettlement?.note ?? null,
  };
}

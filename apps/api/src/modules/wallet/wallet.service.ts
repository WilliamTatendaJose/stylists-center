import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import {
  formatUsd,
  canCashOut,
  type CashOutRequestResponse,
  type WalletTransactionDto,
  type ReferralRowDto,
  type WalletDto,
} from '@sc/shared';
import { walletRates } from '../../config/wallet-rates';
import { SettingsService } from '../settings/settings.service';
import type { Prisma } from '../../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WalletService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly settings?: SettingsService,
  ) {}

  async getWallet(userId: string): Promise<WalletDto> {
    const rates = await walletRates(this.settings);
    const [agent, user] = await Promise.all([
      this.prisma.agent.findUnique({ where: { userId } }),
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: {
          verificationStatus: true,
          referralRecord: {
            select: {
              status: true,
              agent: { select: { user: { select: { displayName: true } } } },
            },
          },
        },
      }),
    ]);
    // Paid referrals from older app versions can predate their corresponding
    // ledger credit. Repair that one-way inconsistency before reporting the
    // wallet so the balance and Commission table never disagree.
    if (agent) {
      await this.reconcileReferralCredits(userId, agent.id, rates.coinUsdCents);
    }
    const balance = await this.balance(userId, rates.coinUsdCents);

    return {
      coins: balance.coins,
      usdCents: balance.usdCents,
      coinUsdCents: rates.coinUsdCents,
      referralRewardCoins: rates.referralRewardCoins,
      referralCode: agent?.referralCode ?? '',
      referredByName: user.referralRecord?.agent.user.displayName ?? null,
      referralStatus: user.referralRecord?.status ?? 'none',
      canCashOut: canCashOut(balance.usdCents, rates.cashOutMinUsdCents),
      cashOutMinUsdCents: rates.cashOutMinUsdCents,
      isVerifiedAgent: agent
        ? agent.verificationStatus === 'verified' && agent.status === 'active'
        : false,
      verificationStatus: user.verificationStatus,
      canBecomeAgent: user.verificationStatus === 'verified' && !agent,
    };
  }

  async enrollAgent(userId: string, referralCode?: string): Promise<WalletDto> {
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { displayName: true, verificationStatus: true },
      });
      if (user.verificationStatus !== 'verified') {
        throw new BadRequestException('Verify your identity before becoming an agent');
      }
      const existing = await tx.agent.findUnique({ where: { userId } });
      if (existing) return;

      const normalizedReferralCode = referralCode?.trim().toUpperCase();
      const existingReferral = await tx.referral.findUnique({
        where: { referredUserId: userId },
        select: { agentId: true },
      });
      const referrer = normalizedReferralCode
        ? await tx.agent.findUnique({
            where: {
              referralCode: normalizedReferralCode,
              status: 'active',
              verificationStatus: 'verified',
            },
            select: { id: true, userId: true },
          })
        : null;
      if (normalizedReferralCode) {
        if (!referrer) {
          throw new BadRequestException('That referral code is not active');
        }
      }
      if (existingReferral && referrer && existingReferral.agentId !== referrer.id) {
        throw new BadRequestException('This account already has an invite linked');
      }

      const referralCodeForNewAgent = `SC-${randomBytes(4).toString('hex').toUpperCase()}`;
      await tx.agent.create({
        data: {
          userId,
          referralCode: referralCodeForNewAgent,
          verificationStatus: 'verified',
          status: 'active',
        },
      });
      if (referrer && referrer.userId !== userId && !existingReferral) {
        await tx.referral.create({
          data: {
            agentId: referrer.id,
            referredUserId: userId,
            referredName: user.displayName,
            coinsAwarded: (await walletRates(this.settings)).referralRewardCoins,
          },
        });
      }
    });
    return this.getWallet(userId);
  }

  /** Links an invite as soon as a user signs in; verification is not required. */
  async claimReferral(userId: string, referralCode: string): Promise<WalletDto> {
    const normalizedReferralCode = referralCode.trim().toUpperCase();
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { displayName: true },
      });
      const existingReferral = await tx.referral.findUnique({
        where: { referredUserId: userId },
        include: { agent: { select: { referralCode: true } } },
      });
      if (existingReferral) {
        if (existingReferral.agent.referralCode !== normalizedReferralCode) {
          throw new BadRequestException('This account already has an invite linked');
        }
        return;
      }

      const referrer = await tx.agent.findUnique({
        where: {
          referralCode: normalizedReferralCode,
          status: 'active',
          verificationStatus: 'verified',
        },
        select: { id: true, userId: true },
      });
      if (!referrer) {
        throw new BadRequestException('That referral code is not active');
      }
      if (referrer.userId === userId) {
        throw new BadRequestException('You cannot use your own referral code');
      }

      await tx.referral.create({
        data: {
          agentId: referrer.id,
          referredUserId: userId,
          referredName: user.displayName,
          coinsAwarded: (await walletRates(this.settings)).referralRewardCoins,
        },
      });
    });
    return this.getWallet(userId);
  }

  async listReferrals(userId: string): Promise<ReferralRowDto[]> {
    const agent = await this.prisma.agent.findUnique({ where: { userId } });
    if (!agent) return [];

    const referrals = await this.prisma.referral.findMany({
      where: { agentId: agent.id },
      orderBy: { createdAt: 'desc' },
    });
    return referrals.map((r) => ({
      id: r.id,
      referredName: r.referredName,
      coins: r.coinsAwarded,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async listTransactions(userId: string): Promise<WalletTransactionDto[]> {
    const transactions = await this.prisma.walletTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { cashOutSettlement: true },
    });
    return transactions.map((transaction) => ({
      id: transaction.id,
      type: transaction.type,
      coins: transaction.coins,
      usdCents: transaction.usdCents,
      reference: transaction.reference,
      createdAt: transaction.createdAt.toISOString(),
      settled: transaction.type === 'cash_out' ? !!transaction.cashOutSettlement : null,
    }));
  }

  /** Server recomputes the balance rather than trusting a client-supplied amount — the same rule matching's retry ladder follows. */
  /**
   * Cashing out drains the whole balance to a single negative ledger row.
   *
   * Reading the balance and then writing that row were two separate
   * statements with nothing between them, so two requests arriving together —
   * a double tap, or a client retry after a response was lost — could both
   * read the same positive balance, both pass the minimum check, and both
   * write a withdrawal. That pays the same money out twice.
   *
   * The row lock makes the read-check-write one atomic step per user: the
   * second request waits, then re-reads a zero balance and is correctly
   * rejected. Locking the User row rather than the ledger because the thing
   * being serialised is "this user's balance", and the rows being counted do
   * not all exist yet at lock time.
   */
  async cashOut(userId: string): Promise<CashOutRequestResponse> {
    const { coinUsdCents, cashOutMinUsdCents } = await walletRates(this.settings);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;

      const agg = await tx.walletTransaction.aggregate({
        where: { userId },
        _sum: { coins: true },
      });
      const coins = agg._sum.coins ?? 0;
      // Coins are the durable balance. Their cash value is converted at the
      // current server-configured rate rather than a historic reward rate.
      const usdCents = coins * coinUsdCents;

      if (!canCashOut(usdCents, cashOutMinUsdCents)) {
        throw new BadRequestException(
          `Balance must exceed ${formatUsd(cashOutMinUsdCents)} to cash out`,
        );
      }

      const txn = await tx.walletTransaction.create({
        data: { userId, type: 'cash_out', coins: -coins, usdCents: -usdCents },
      });

      return { id: txn.id, amountUsdCents: usdCents, status: 'pending' as const };
    });
  }

  /** The ledger is append-only (plan §6) — balance is always a live sum, never a stored counter. */
  private async balance(
    userId: string,
    coinUsdCents: number,
  ): Promise<{ coins: number; usdCents: number }> {
    const agg = await this.prisma.walletTransaction.aggregate({
      where: { userId },
      _sum: { coins: true },
    });
    const coins = agg._sum.coins ?? 0;
    return { coins, usdCents: coins * coinUsdCents };
  }

  /**
   * Brings historic paid referrals into the append-only wallet ledger.
   *
   * Referral and ledger entries are written atomically today, but legacy rows
   * may have a paid Commission entry without its matching wallet credit. The
   * user-row lock makes this repair idempotent across concurrent wallet reads.
   */
  private async reconcileReferralCredits(
    userId: string,
    agentId: string,
    coinUsdCents: number,
  ): Promise<void> {
    // Every wallet read lands here, but a repair is almost never needed.
    // Check without the lock first so the common case is two plain aggregates
    // rather than a transaction holding FOR UPDATE on the user row.
    if ((await this.missingReferralCoins(this.prisma, userId, agentId)) <= 0) return;

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;

      // The unlocked check above can be stale: a concurrent read may have
      // repaired it already. Re-check under the lock so we never credit twice.
      const missingCoins = await this.missingReferralCoins(tx, userId, agentId);
      if (missingCoins <= 0) return;

      await tx.walletTransaction.create({
        data: {
          userId,
          type: 'referral_coin',
          coins: missingCoins,
          usdCents: missingCoins * coinUsdCents,
          reference: 'Referral reward reconciliation',
        },
      });
    });
  }

  /** Paid referral coins minus referral coins already credited to the wallet ledger. */
  private async missingReferralCoins(
    db: Pick<Prisma.TransactionClient, 'referral' | 'walletTransaction'>,
    userId: string,
    agentId: string,
  ): Promise<number> {
    const [paidReferrals, creditedRewards] = await Promise.all([
      db.referral.aggregate({
        where: { agentId, status: 'paid' },
        _sum: { coinsAwarded: true },
      }),
      db.walletTransaction.aggregate({
        where: { userId, type: 'referral_coin' },
        _sum: { coins: true },
      }),
    ]);
    return (paidReferrals._sum.coinsAwarded ?? 0) - (creditedRewards._sum.coins ?? 0);
  }
}

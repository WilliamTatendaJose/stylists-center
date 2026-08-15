import { BadRequestException, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import {
  CASH_OUT_MIN_USD_CENTS,
  canCashOut,
  COIN_USD_CENTS,
  type CashOutRequestResponse,
  type ReferralRowDto,
  type WalletDto,
  REFERRAL_REWARD_COINS,
} from '@sc/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  async getWallet(userId: string): Promise<WalletDto> {
    const [agent, user] = await Promise.all([
      this.prisma.agent.findUnique({ where: { userId } }),
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { verificationStatus: true } }),
    ]);
    const balance = await this.balance(userId);

    return {
      coins: balance.coins,
      usdCents: balance.usdCents,
      coinUsdCents: COIN_USD_CENTS,
      referralCode: agent?.referralCode ?? '',
      canCashOut: canCashOut(balance.usdCents),
      cashOutMinUsdCents: CASH_OUT_MIN_USD_CENTS,
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

      const referrer = referralCode
        ? await tx.agent.findUnique({ where: { referralCode }, select: { id: true, userId: true, status: true } })
        : null;
      if (referralCode && (!referrer || referrer.status !== 'active')) {
        throw new BadRequestException('That referral code is not active');
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
      if (referrer && referrer.userId !== userId) {
        await tx.referral.create({
          data: {
            agentId: referrer.id,
            referredUserId: userId,
            referredName: user.displayName,
            coinsAwarded: REFERRAL_REWARD_COINS,
          },
        });
      }
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
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;

      const agg = await tx.walletTransaction.aggregate({
        where: { userId },
        _sum: { coins: true, usdCents: true },
      });
      const coins = agg._sum.coins ?? 0;
      const usdCents = agg._sum.usdCents ?? 0;

      if (!canCashOut(usdCents)) {
        throw new BadRequestException(
          `Balance must exceed $${String(CASH_OUT_MIN_USD_CENTS / 100)} to cash out`,
        );
      }

      const txn = await tx.walletTransaction.create({
        data: { userId, type: 'cash_out', coins: -coins, usdCents: -usdCents },
      });

      return { id: txn.id, amountUsdCents: usdCents, status: 'pending' as const };
    });
  }

  /** The ledger is append-only (plan §6) — balance is always a live sum, never a stored counter. */
  private async balance(userId: string): Promise<{ coins: number; usdCents: number }> {
    const agg = await this.prisma.walletTransaction.aggregate({
      where: { userId },
      _sum: { coins: true, usdCents: true },
    });
    return { coins: agg._sum.coins ?? 0, usdCents: agg._sum.usdCents ?? 0 };
  }
}

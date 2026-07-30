import { BadRequestException, Injectable } from '@nestjs/common';
import {
  CASH_OUT_MIN_USD_CENTS,
  canCashOut,
  COIN_USD_CENTS,
  type CashOutRequestResponse,
  type ReferralRowDto,
  type WalletDto,
} from '@sc/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  async getWallet(userId: string): Promise<WalletDto> {
    const agent = await this.prisma.agent.findUnique({ where: { userId } });
    const balance = await this.balance(userId);

    return {
      coins: balance.coins,
      usdCents: balance.usdCents,
      coinUsdCents: COIN_USD_CENTS,
      referralCode: agent?.referralCode ?? '',
      canCashOut: canCashOut(balance.usdCents),
      cashOutMinUsdCents: CASH_OUT_MIN_USD_CENTS,
      isVerifiedAgent: agent ? agent.verificationStatus === 'verified' && agent.status === 'active' : false,
    };
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
  async cashOut(userId: string): Promise<CashOutRequestResponse> {
    const balance = await this.balance(userId);
    if (!canCashOut(balance.usdCents)) {
      throw new BadRequestException(`Balance must exceed $${String(CASH_OUT_MIN_USD_CENTS / 100)} to cash out`);
    }

    const txn = await this.prisma.walletTransaction.create({
      data: { userId, type: 'cash_out', coins: -balance.coins, usdCents: -balance.usdCents },
    });

    return { id: txn.id, amountUsdCents: balance.usdCents, status: 'pending' };
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

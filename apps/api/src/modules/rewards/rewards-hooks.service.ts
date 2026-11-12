import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { rewardCoinsForSpend } from '@sc/shared';
import type { Prisma } from '../../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService, settingsFor } from '../settings/settings.service';
import {
  addMonths,
  coinBalance,
  insertOnce,
  lockWallet,
  restoreSpend,
  spendCoins,
} from './coin-ledger';
import { awardRecruitmentReward } from './recruitment';

type Ref = { bookingId: string } | { orderId: string };

/**
 * Where bookings and the marketplace tell the rewards programme something
 * happened. Kept separate so those flows don't depend on how coins work.
 *
 * Every method is called inside the caller's transaction (`tx`) so coins
 * move if and only if the booking or order change commits, and is idempotent
 * per booking/order: each ledger row has a unique `dedupeKey` and is written
 * with ON CONFLICT DO NOTHING, because a caught unique violation would abort
 * the caller's Postgres transaction.
 */
@Injectable()
export class RewardsHooksService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly settings?: SettingsService,
  ) {}

  /** A booking reached `completed`. Clients earn coins on the amount they paid. */
  async onBookingCompleted(
    tx: Prisma.TransactionClient,
    input: { bookingId: string; clientId: string; amountPaidUsdCents: number },
  ): Promise<void> {
    const s = await this.rates();
    const coins = rewardCoinsForSpend(input.amountPaidUsdCents, s.rewardSpendUsdPerCoin);
    if (coins <= 0) return;
    await insertOnce(tx, {
      userId: input.clientId,
      type: 'booking_reward',
      pool: 'spend',
      coins,
      coinUsdCents: s.coinUsdCents,
      dedupeKey: `booking_reward:${input.bookingId}`,
      reference: 'Completed booking',
      expiresAt: addMonths(new Date(), s.coinExpiryMonths),
    });
  }

  /**
   * An order was delivered or collected. The buyer earns coins, and the
   * agent whose code the buyer used earns on it while the referral lasts
   * and their subscription is active.
   */
  async onOrderCompleted(
    tx: Prisma.TransactionClient,
    input: { orderId: string; buyerId: string; productTotalUsdCents: number },
  ): Promise<void> {
    const s = await this.rates();
    const now = new Date();
    // Clients and agents have separate rates (settings), so each is worked
    // out on its own; rounding down means a small purchase can earn nothing.
    const coins = rewardCoinsForSpend(input.productTotalUsdCents, s.rewardSpendUsdPerCoin);
    if (coins > 0) {
      await insertOnce(tx, {
        userId: input.buyerId,
        type: 'purchase_reward',
        pool: 'spend',
        coins,
        coinUsdCents: s.coinUsdCents,
        dedupeKey: `purchase_reward:${input.orderId}`,
        reference: 'Marketplace purchase',
        expiresAt: addMonths(now, s.coinExpiryMonths),
      });
    }
    // Agents only start earning from a minimum purchase (setting).
    if (input.productTotalUsdCents < s.agentMinPurchaseUsd * 100) return;
    const agentCoins = rewardCoinsForSpend(
      input.productTotalUsdCents,
      s.agentRewardSpendUsdPerCoin,
    );
    if (agentCoins <= 0) return;

    const referral = await tx.referral.findUnique({
      where: { referredUserId: input.buyerId },
      include: { agent: true },
    });
    if (!referral) return;
    const { agent } = referral;
    const subscribed = (agent.subscriptionPaidUntil?.getTime() ?? 0) > now.getTime();
    const withinAttribution =
      now.getTime() < addMonths(referral.createdAt, s.referralAttributionMonths).getTime();
    if (
      agent.userId === input.buyerId ||
      agent.status !== 'active' ||
      agent.verificationStatus !== 'verified' ||
      !subscribed ||
      !withinAttribution
    ) {
      return;
    }
    await insertOnce(tx, {
      userId: agent.userId,
      type: 'referral_purchase',
      pool: 'agent',
      coins: agentCoins,
      coinUsdCents: s.coinUsdCents,
      dedupeKey: `referral_purchase:${input.orderId}`,
      reference: `Purchase by ${referral.referredName}`,
    });
  }

  /**
   * A recruited agent may now qualify (verified and paid their first
   * subscription): pay the recruiter. Safe to call at any time.
   */
  async onAgentMilestone(tx: Prisma.TransactionClient, agentUserId: string): Promise<void> {
    await awardRecruitmentReward(tx, agentUserId, (await this.rates()).coinUsdCents);
  }

  /**
   * A client pays part of a booking with coins: debit the client and credit
   * the stylist the same number of coins (the stylist cashes them out).
   * Returns the cash value taken off what the client pays the stylist.
   * Throws if the client doesn't have enough coins.
   */
  async redeemForBooking(
    tx: Prisma.TransactionClient,
    input: { bookingId: string; clientId: string; providerUserId: string; coins: number },
  ): Promise<{ usdCents: number }> {
    return this.redeem(tx, {
      key: `booking:${input.bookingId}`,
      reference: 'Paid a booking with coins',
      payerId: input.clientId,
      receiverId: input.providerUserId,
      coins: input.coins,
    });
  }

  /** Same as redeemForBooking, for a marketplace order paid partly with coins. */
  async redeemForOrder(
    tx: Prisma.TransactionClient,
    input: { orderId: string; buyerId: string; vendorUserId: string; coins: number },
  ): Promise<{ usdCents: number }> {
    return this.redeem(tx, {
      key: `order:${input.orderId}`,
      reference: 'Paid an order with coins',
      payerId: input.buyerId,
      receiverId: input.vendorUserId,
      coins: input.coins,
    });
  }

  /**
   * A booking or order that used coins was cancelled: give the client's coins
   * back and take them back from the stylist or vendor. Once only.
   *
   * Earned coins return to the rows they came from, so they keep their
   * original expiry; any that have expired since are not brought back. If the
   * stylist or vendor has already cashed those coins out, their coin balance
   * is simply lower next time (it never shows below zero).
   */
  async refundRedemption(tx: Prisma.TransactionClient, ref: Ref): Promise<void> {
    const key = 'bookingId' in ref ? `booking:${ref.bookingId}` : `order:${ref.orderId}`;
    const keyBase = `redeem_debit:${key}`;
    const creditKey = `redeem_credit:${key}`;
    const credit = await tx.walletTransaction.findUnique({ where: { dedupeKey: creditKey } });
    if (!credit) return;
    const s = await this.rates();
    const anyDebit = await tx.walletTransaction.findFirst({
      where: { dedupeKey: { startsWith: `${keyBase}:` } },
      select: { userId: true },
    });
    if (anyDebit) await lockWallet(tx, anyDebit.userId);
    await restoreSpend(tx, { keyBase, coinUsdCents: s.coinUsdCents, now: new Date() });
    await insertOnce(tx, {
      userId: credit.userId,
      type: 'refund',
      pool: 'cash',
      coins: -credit.coins,
      coinUsdCents: s.coinUsdCents,
      dedupeKey: `refund:${creditKey}`,
      reference: 'Coins taken back: cancelled',
    });
  }

  /**
   * A booking that had earned the client coins turned out not to be
   * completed (the stylist reported the client did not pay): take back the
   * coins it earned. Only coins still unspent and unexpired can be taken
   * back; any the client already spent stay spent. Once only. Returns the
   * coins taken back.
   */
  async reverseBookingReward(
    tx: Prisma.TransactionClient,
    input: { bookingId: string },
  ): Promise<number> {
    const key = `booking_reward:${input.bookingId}`;
    const earned = await tx.walletTransaction.findUnique({ where: { dedupeKey: key } });
    if (!earned) return 0;
    await lockWallet(tx, earned.userId);
    // Re-read under the lock: a spend may have used some of these coins.
    const lot = await tx.walletTransaction.findUniqueOrThrow({ where: { id: earned.id } });
    const now = new Date();
    const unspent = lot.expiresAt && lot.expiresAt > now ? (lot.remainingCoins ?? 0) : 0;
    if (unspent <= 0) return 0;
    const s = await this.rates();
    const wrote = await insertOnce(tx, {
      userId: lot.userId,
      type: 'refund',
      pool: 'spend',
      coins: -unspent,
      coinUsdCents: s.coinUsdCents,
      dedupeKey: `reversal:${key}`,
      reference: 'Coins taken back: booking not completed',
    });
    if (!wrote) return 0;
    await tx.walletTransaction.update({
      where: { id: lot.id },
      data: { remainingCoins: { decrement: unspent } },
    });
    return unspent;
  }

  private async redeem(
    tx: Prisma.TransactionClient,
    input: { key: string; reference: string; payerId: string; receiverId: string; coins: number },
  ): Promise<{ usdCents: number }> {
    const { key, payerId, receiverId, coins } = input;
    if (!Number.isInteger(coins) || coins <= 0) {
      throw new BadRequestException('Choose how many coins to use');
    }
    if (payerId === receiverId) {
      throw new BadRequestException("You can't pay yourself with coins");
    }
    const s = await this.rates();
    await lockWallet(tx, payerId);

    const creditKey = `redeem_credit:${key}`;
    const existing = await tx.walletTransaction.findUnique({ where: { dedupeKey: creditKey } });
    if (existing) {
      const refunded = await tx.walletTransaction.findUnique({
        where: { dedupeKey: `refund:${creditKey}` },
      });
      if (refunded) throw new BadRequestException('Coins for this payment were already returned');
      return { usdCents: existing.coins * s.coinUsdCents };
    }

    const now = new Date();
    const spent = await spendCoins(tx, {
      userId: payerId,
      coins,
      keyBase: `redeem_debit:${key}`,
      reference: input.reference,
      coinUsdCents: s.coinUsdCents,
      now,
    });
    if (!spent) {
      const balance = await coinBalance(tx, payerId, { agentActive: false, now });
      throw new BadRequestException(
        `Not enough coins: you have ${String(balance.spendable)} to use`,
      );
    }
    await insertOnce(tx, {
      userId: receiverId,
      type: 'redeem_credit',
      pool: 'cash',
      coins,
      coinUsdCents: s.coinUsdCents,
      dedupeKey: creditKey,
      reference: 'Client paid with coins',
    });
    return { usdCents: coins * s.coinUsdCents };
  }

  private rates() {
    return (this.settings ?? settingsFor(this.prisma)).all();
  }
}

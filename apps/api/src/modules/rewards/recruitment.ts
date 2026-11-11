import type { Prisma } from '../../generated/prisma';
import { insertOnce } from './coin-ledger';

/**
 * Pays the recruiting agent their reward for a recruited agent, once that
 * recruit is verified AND has paid their first agent subscription.
 *
 * Both events can happen in either order, so this is called from the
 * subscription-paid path and from verification approval, and does nothing
 * until both are true. It is idempotent: the referral can only move from
 * `pending` to `paid` once, and the ledger row is keyed on the referral.
 *
 * The reward is credited to the recruiter's agent coins even if their own
 * subscription has lapsed; it just can't be cashed out until it is renewed.
 *
 * Returns true if coins were credited by this call.
 */
export async function awardRecruitmentReward(
  tx: Prisma.TransactionClient,
  recruitUserId: string,
  coinUsdCents: number,
): Promise<boolean> {
  const recruit = await tx.agent.findUnique({
    where: { userId: recruitUserId },
    select: { verificationStatus: true, subscriptionPaidUntil: true },
  });
  if (recruit?.verificationStatus !== 'verified' || !recruit.subscriptionPaidUntil) {
    return false;
  }
  const referral = await tx.referral.findUnique({
    where: { referredUserId: recruitUserId },
    include: { agent: { select: { userId: true, status: true } } },
  });
  if (referral?.status !== 'pending' || referral.agent.status !== 'active') {
    return false;
  }
  const claimed = await tx.referral.updateMany({
    where: { id: referral.id, status: 'pending' },
    data: { status: 'paid' },
  });
  if (claimed.count !== 1) return false;
  return insertOnce(tx, {
    userId: referral.agent.userId,
    type: 'referral_coin',
    pool: 'agent',
    // The promise made when the invite was linked, as the Commission list shows it.
    coins: referral.coinsAwarded,
    coinUsdCents,
    dedupeKey: `recruit_reward:${referral.id}`,
    reference: `Recruited agent ${referral.referredName}`,
  });
}

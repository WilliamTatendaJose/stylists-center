import { z } from 'zod';
import { verificationStatusSchema } from './verification.js';
import { payerPhoneSchema } from './bookings.js';
import { payChannelSchema, paymentActionSchema } from './payments.js';

/** An agent's subscription to the rewards programme. */
export const agentSubscriptionSchema = z.object({
  priceUsdCents: z.number().int(),
  cycleDays: z.number().int(),
  /** Null until the agent's first payment. */
  paidUntil: z.iso.datetime().nullable(),
  /** Server-computed so the badge the app shows and the gate the API enforces cannot drift. */
  active: z.boolean(),
});
export type AgentSubscriptionDto = z.infer<typeof agentSubscriptionSchema>;

export const walletSchema = z.object({
  /** Every coin the person holds that has not expired: spendable plus agent earnings. */
  coins: z.number().int(),
  usdCents: z.number().int(),
  /** Coins that can pay for a service or product now (earned coins and coins received from clients). */
  spendableCoins: z.number().int(),
  /** Coins that can be cashed out now: coins received from clients, plus agent earnings while the subscription is active. */
  cashOutableCoins: z.number().int(),
  cashOutableUsdCents: z.number().int(),
  /** Agent earnings that cannot be cashed out until the subscription is active again. */
  lockedAgentCoins: z.number().int(),
  /** When the soonest-expiring earned coins run out, and how many. Null when none will expire. */
  nextExpiryAt: z.iso.datetime().nullable(),
  nextExpiryCoins: z.number().int(),
  /** Null for people who are not agents. */
  agentSubscription: agentSubscriptionSchema.nullable(),
  /** When the next cash-out is allowed; null when one can be requested now. */
  nextCashOutAt: z.iso.datetime().nullable(),
  cashOutIntervalDays: z.number().int(),
  coinUsdCents: z.number().int(),
  referralRewardCoins: z.number().int().positive(),
  referralCode: z.string(),
  referredByName: z.string().nullable(),
  referralStatus: z.enum(['none', 'pending', 'paid']),
  canCashOut: z.boolean(),
  cashOutMinUsdCents: z.number().int(),
  isVerifiedAgent: z.boolean(),
  verificationStatus: verificationStatusSchema,
  canBecomeAgent: z.boolean(),
});
export type WalletDto = z.infer<typeof walletSchema>;

export const referralStatusSchema = z.enum(['pending', 'paid']);

export const referralRowSchema = z.object({
  id: z.uuid(),
  referredName: z.string(),
  coins: z.number().int(),
  status: referralStatusSchema,
  createdAt: z.iso.datetime(),
});
export type ReferralRowDto = z.infer<typeof referralRowSchema>;

export const walletTransactionTypeSchema = z.enum([
  'referral_coin',
  'cash_out',
  'adjustment',
  'booking_reward',
  'purchase_reward',
  'referral_purchase',
  'redeem_debit',
  'redeem_credit',
  'expiry',
  'refund',
]);

/** Which kind of coins a ledger row moved: spend-only, received from clients (cash), or agent earnings. */
export const coinPoolSchema = z.enum(['spend', 'cash', 'agent']);
export type CoinPool = z.infer<typeof coinPoolSchema>;

export const walletTransactionSchema = z.object({
  id: z.uuid(),
  type: walletTransactionTypeSchema,
  coins: z.number().int(),
  usdCents: z.number().int(),
  reference: z.string().nullable(),
  createdAt: z.iso.datetime(),
  pool: coinPoolSchema,
  /** Only meaningful for `cash_out` rows — whether an admin has recorded the real-world transfer. Null for every other type. */
  settled: z.boolean().nullable(),
});
export type WalletTransactionDto = z.infer<typeof walletTransactionSchema>;

export const cashOutRequestResponseSchema = z.object({
  id: z.uuid(),
  amountUsdCents: z.number().int(),
  status: z.literal('pending'),
});
export type CashOutRequestResponse = z.infer<typeof cashOutRequestResponseSchema>;

/** `POST /v1/wallet/agent-subscription/pay`. */
export const payAgentSubscriptionSchema = z.object({
  payerPhone: payerPhoneSchema.optional(),
  payChannel: payChannelSchema.optional(),
});
export type PayAgentSubscriptionInput = z.infer<typeof payAgentSubscriptionSchema>;

export const payAgentSubscriptionResponseSchema = z.object({
  paidUntil: z.iso.datetime().nullable(),
  /** True while awaiting confirmation: poll the payment status, don't assume success. */
  pending: z.boolean(),
  checkoutUrl: z.string().optional(),
  instructions: z.string().optional(),
  action: paymentActionSchema.optional(),
  /** What an O'mari code is submitted against. */
  reference: z.string().optional(),
});
export type PayAgentSubscriptionResponse = z.infer<typeof payAgentSubscriptionResponseSchema>;

export const agentSubscriptionStatusSchema = z.object({
  status: z.enum(['none', 'pending', 'held', 'paid', 'released', 'refunded', 'failed', 'disputed']),
  paidUntil: z.iso.datetime().nullable(),
  active: z.boolean(),
});
export type AgentSubscriptionStatusDto = z.infer<typeof agentSubscriptionStatusSchema>;

export const enrollAgentSchema = z.object({
  referralCode: z.string().trim().toUpperCase().min(3).max(32).optional(),
});
export type EnrollAgentInput = z.infer<typeof enrollAgentSchema>;

export const claimReferralSchema = z.object({
  referralCode: z.string().trim().toUpperCase().min(3).max(32),
});
export type ClaimReferralInput = z.infer<typeof claimReferralSchema>;

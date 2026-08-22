import { z } from 'zod';
import { verificationStatusSchema } from './verification.js';

export const walletSchema = z.object({
  coins: z.number().int(),
  usdCents: z.number().int(),
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

export const walletTransactionTypeSchema = z.enum(['referral_coin', 'cash_out', 'adjustment']);

export const walletTransactionSchema = z.object({
  id: z.uuid(),
  type: walletTransactionTypeSchema,
  coins: z.number().int(),
  usdCents: z.number().int(),
  reference: z.string().nullable(),
  createdAt: z.iso.datetime(),
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

export const enrollAgentSchema = z.object({
  referralCode: z.string().trim().toUpperCase().min(3).max(32).optional(),
});
export type EnrollAgentInput = z.infer<typeof enrollAgentSchema>;

export const claimReferralSchema = z.object({
  referralCode: z.string().trim().toUpperCase().min(3).max(32),
});
export type ClaimReferralInput = z.infer<typeof claimReferralSchema>;

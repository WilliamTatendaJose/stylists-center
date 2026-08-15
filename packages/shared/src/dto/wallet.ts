import { z } from 'zod';
import { verificationStatusSchema } from './verification.js';

export const walletSchema = z.object({
  coins: z.number().int(),
  usdCents: z.number().int(),
  coinUsdCents: z.number().int(),
  referralCode: z.string(),
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
});
export type ReferralRowDto = z.infer<typeof referralRowSchema>;

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

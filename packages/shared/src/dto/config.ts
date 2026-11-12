import { z } from 'zod';
import { CONTENT_BODY_MAX_LENGTH, CONTENT_KEYS } from '../domain/content.js';

/**
 * `GET /v1/config` — the public settings the apps need (prices, rewards,
 * budget range, support contacts). Values are whatever is in effect now:
 * console value, else environment variable, else the built-in default.
 */
export const appConfigSchema = z.object({
  coinUsdCents: z.number().int(),
  referralRewardCoins: z.number().int(),
  cashOutMinUsdCents: z.number().int(),
  subscriptionPriceUsdCents: z.number().int(),
  subscriptionCycleDays: z.number().int(),
  budgetMinUsd: z.number().int(),
  budgetMaxUsd: z.number().int(),
  budgetStepUsd: z.number().int(),
  serviceFeeBps: z.number().int(),
  /** 'client' adds the fee to the client's price; 'stylist' leaves the listed price. */
  serviceFeePaidBy: z.enum(['client', 'stylist']),
  marketplaceFeeBps: z.number().int(),
  billingDueDay: z.number().int(),
  feeRestrictAfterDays: z.number().int(),
  completionAutoConfirmHours: z.number().int(),
  nonPaymentReportHours: z.number().int(),
  rewardSpendUsdPerCoin: z.number().int(),
  agentRewardSpendUsdPerCoin: z.number().int(),
  agentMinPurchaseUsd: z.number().int(),
  cashOutPayoutDays: z.number().int(),
  coinExpiryMonths: z.number().int(),
  referralAttributionMonths: z.number().int(),
  cashOutIntervalDays: z.number().int(),
  supportPhone: z.string(),
  supportWhatsapp: z.string(),
  supportEmail: z.string(),
  supportHours: z.string(),
});
export type AppConfigDto = z.infer<typeof appConfigSchema>;

export const contentKeySchema = z.enum(CONTENT_KEYS);

/** `GET /v1/content/:key` — a terms or privacy document. */
export const contentDocumentSchema = z.object({
  key: contentKeySchema,
  title: z.string(),
  body: z.string(),
  /** 0 while the placeholder is showing; goes up by one each time staff save. */
  version: z.number().int().nonnegative(),
  /** True until staff save the first real version. */
  isPlaceholder: z.boolean(),
  updatedAt: z.iso.datetime().nullable(),
});
export type ContentDocumentDto = z.infer<typeof contentDocumentSchema>;

/** `PUT /v1/admin/content/:key`. */
export const updateContentDocumentSchema = z.object({
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(CONTENT_BODY_MAX_LENGTH),
});
export type UpdateContentDocumentInput = z.infer<typeof updateContentDocumentSchema>;

/** Where the value in effect comes from. */
export const settingSourceSchema = z.enum(['console', 'environment', 'default']);
export type SettingSource = z.infer<typeof settingSourceSchema>;

/** One row of the console's Settings page. */
export const adminSettingSchema = z.object({
  key: z.string(),
  label: z.string(),
  help: z.string(),
  group: z.string(),
  kind: z.enum(['cents', 'coins', 'days', 'usd', 'bps', 'count', 'text']),
  value: z.union([z.number(), z.string()]),
  source: settingSourceSchema,
  /** The environment variable that sets this when no console value is saved. */
  env: z.string(),
  /** What the environment variable or default would give if the console value were removed. */
  fallbackValue: z.union([z.number(), z.string()]),
  min: z.number().optional(),
  max: z.number().optional(),
  maxLength: z.number().optional(),
  options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
  updatedAt: z.iso.datetime().nullable(),
});
export type AdminSettingDto = z.infer<typeof adminSettingSchema>;

/** `PUT /v1/admin/settings/:key` — null removes the console value. */
export const updateSettingSchema = z.object({
  value: z.union([z.number(), z.string(), z.null()]),
});
export type UpdateSettingInput = z.infer<typeof updateSettingSchema>;

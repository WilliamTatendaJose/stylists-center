import { z } from 'zod';
import { payerPhoneSchema } from './bookings.js';
import { payChannelSchema, paymentActionSchema } from './payments.js';
import { pagedSchema } from './admin.js';

/**
 * What a stylist or vendor owes StylistsCenter, as shown in the app and in
 * the admin console. Money is integer USD cents; positive means owed.
 */

/** Smallest part payment. Paying the whole balance is always allowed, even below this. */
export const MIN_FEE_PAYMENT_USD_CENTS = 100;

export const feeEntryKindSchema = z.enum([
  'booking_fee',
  'order_fee',
  'waiver',
  'payment',
  'adjustment',
]);
export type FeeEntryKindDto = z.infer<typeof feeEntryKindSchema>;

export const feeEntrySchema = z.object({
  id: z.string(),
  kind: feeEntryKindSchema,
  /** Signed: fees are positive, waivers and payments negative. */
  amountUsdCents: z.number().int(),
  /** What the fee was charged on (the job price or product total). */
  baseUsdCents: z.number().int().nullable(),
  rateBps: z.number().int().nullable(),
  /** The booking or order reference, when the entry belongs to a job. */
  reference: z.string().nullable(),
  /** A short description of the job (service name or "Order"). */
  label: z.string().nullable(),
  note: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type FeeEntryDto = z.infer<typeof feeEntrySchema>;

export const feeStatementSchema = z.object({
  id: z.string(),
  /** 'YYYY-MM', Harare calendar month. */
  month: z.string(),
  periodStart: z.iso.datetime(),
  periodEnd: z.iso.datetime(),
  openingUsdCents: z.number().int(),
  bookingFeesUsdCents: z.number().int(),
  orderFeesUsdCents: z.number().int(),
  waiversUsdCents: z.number().int(),
  paymentsUsdCents: z.number().int(),
  adjustmentsUsdCents: z.number().int(),
  closingUsdCents: z.number().int(),
  dueAt: z.iso.datetime(),
  /** What is still unpaid on this statement now: its closing balance less payments since. Never below 0. */
  unpaidUsdCents: z.number().int().nonnegative(),
  generatedAt: z.iso.datetime(),
});
export type FeeStatementDto = z.infer<typeof feeStatementSchema>;

/** `GET /v1/provider/fees` */
export const feeSummarySchema = z.object({
  /** Owed right now, including this month's fees so far. Negative means a credit. */
  balanceUsdCents: z.number().int(),
  minPaymentUsdCents: z.number().int(),
  /** This calendar month so far (not yet on a statement). */
  thisMonth: z.object({
    since: z.iso.datetime(),
    jobCount: z.number().int().nonnegative(),
    feesUsdCents: z.number().int(),
  }),
  latestStatement: feeStatementSchema.nullable(),
  /** Past its due date and still unpaid. */
  overdueUsdCents: z.number().int().nonnegative(),
  restricted: z.boolean(),
  /** A payment was started and has not settled yet. */
  paymentPending: z.boolean(),
});
export type FeeSummaryDto = z.infer<typeof feeSummarySchema>;

/** `POST /v1/provider/fees/pay` */
export const payFeesSchema = z.object({
  /** Leave out to pay the whole balance. */
  amountUsdCents: z.number().int().positive().optional(),
  payChannel: payChannelSchema.optional(),
  payerPhone: payerPhoneSchema.optional(),
});
export type PayFeesInput = z.infer<typeof payFeesSchema>;

export const payFeesResponseSchema = z.object({
  amountUsdCents: z.number().int(),
  /** True while awaiting confirmation: poll `fees/payment-status`, don't assume success. */
  pending: z.boolean(),
  checkoutUrl: z.string().optional(),
  instructions: z.string().optional(),
  action: paymentActionSchema.optional(),
  reference: z.string().optional(),
});
export type PayFeesResponse = z.infer<typeof payFeesResponseSchema>;

/** `GET /v1/provider/fees/payment-status` */
export const feePaymentStatusSchema = z.object({
  status: z.enum(['none', 'pending', 'held', 'paid', 'released', 'refunded', 'failed', 'disputed']),
  balanceUsdCents: z.number().int(),
});
export type FeePaymentStatusDto = z.infer<typeof feePaymentStatusSchema>;

// --- Admin console ----------------------------------------------------

export const adminFeeRowSchema = z.object({
  providerId: z.string(),
  displayName: z.string(),
  phone: z.string().nullable(),
  balanceUsdCents: z.number().int(),
  overdueUsdCents: z.number().int().nonnegative(),
  restricted: z.boolean(),
  lastPaymentAt: z.iso.datetime().nullable(),
  lastPaymentUsdCents: z.number().int().nullable(),
});
export type AdminFeeRowDto = z.infer<typeof adminFeeRowSchema>;
export const adminFeeListSchema = pagedSchema(adminFeeRowSchema);

export const adminFeeSummarySchema = z.object({
  owedUsdCents: z.number().int(),
  overdueUsdCents: z.number().int(),
  providersOwing: z.number().int(),
  restrictedCount: z.number().int(),
});
export type AdminFeeSummaryDto = z.infer<typeof adminFeeSummarySchema>;

export const adminFeeDetailSchema = z.object({
  provider: adminFeeRowSchema,
  statements: z.array(feeStatementSchema),
  entries: z.array(feeEntrySchema),
});
export type AdminFeeDetailDto = z.infer<typeof adminFeeDetailSchema>;

/** `POST /v1/admin/fees/:providerId/payments`: a payment made outside the app. */
export const recordFeePaymentSchema = z.object({
  amountUsdCents: z.number().int().positive(),
  method: z.enum(['cash', 'bank', 'other']),
  note: z.string().trim().min(1, 'Add a note').max(500),
});
export type RecordFeePaymentInput = z.infer<typeof recordFeePaymentSchema>;

/** `POST /v1/admin/fees/:providerId/adjustments`: positive adds to what is owed, negative reduces it. */
export const adjustFeesSchema = z.object({
  amountUsdCents: z
    .number()
    .int()
    .refine((value) => value !== 0, 'Enter an amount'),
  note: z.string().trim().min(1, 'Add a note').max(500),
});
export type AdjustFeesInput = z.infer<typeof adjustFeesSchema>;

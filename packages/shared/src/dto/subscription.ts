import { z } from 'zod';
import { payerPhoneSchema, paymentMethodSchema } from './bookings.js';

/** `GET /v1/provider/subscription` — the My page subscription card's only data source. */
export const providerSubscriptionSchema = z.object({
  priceUsdCents: z.number().int(),
  /** Null for a provider who has never paid. */
  paidUntil: z.iso.datetime().nullable(),
  /** Server-computed from `paidUntil` so the badge the client renders and the gate the API enforces cannot drift. */
  active: z.boolean(),
});
export type ProviderSubscriptionDto = z.infer<typeof providerSubscriptionSchema>;

/** `POST /v1/provider/subscription/pay`. Cash is a self-report with no counterparty to double-confirm against — unlike a booking, this money is owed to the platform, not held for someone else. */
export const paySubscriptionSchema = z.object({
  paymentMethod: paymentMethodSchema,
  /** Required in practice for EcoCash — the number the prompt is sent to. Falls back to the account phone when absent. */
  payerPhone: payerPhoneSchema.optional(),
});
export type PaySubscriptionInput = z.infer<typeof paySubscriptionSchema>;

export const paySubscriptionResponseSchema = z.object({
  /**
   * Null when an EcoCash payment is still in flight and the provider has
   * never paid before — there is no renewal date to show yet. Unchanged from
   * the previous value while a renewal is pending: the month is credited only
   * once Paynow confirms.
   */
  paidUntil: z.iso.datetime().nullable(),
  /** True while awaiting confirmation — the caller must poll `subscription/payment-status`, not assume success. */
  pending: z.boolean(),
  /** Present only when Paynow returned a hosted checkout page rather than a phone prompt. */
  checkoutUrl: z.string().optional(),
  /** Present when Paynow pushed an EcoCash prompt to the provider's phone — show while polling. */
  instructions: z.string().optional(),
});
export type PaySubscriptionResponse = z.infer<typeof paySubscriptionResponseSchema>;

/** `GET /v1/provider/subscription/payment-status` — polled while an EcoCash subscription payment is in flight. */
export const subscriptionPaymentStatusSchema = z.object({
  status: z.enum(['none', 'pending', 'held', 'paid', 'released', 'refunded', 'failed', 'disputed']),
  paidUntil: z.iso.datetime().nullable(),
  active: z.boolean(),
});
export type SubscriptionPaymentStatusDto = z.infer<typeof subscriptionPaymentStatusSchema>;

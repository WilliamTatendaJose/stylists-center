import { z } from 'zod';
import { paymentMethodSchema } from './bookings.js';

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
});
export type PaySubscriptionInput = z.infer<typeof paySubscriptionSchema>;

export const paySubscriptionResponseSchema = z.object({
  paidUntil: z.iso.datetime(),
  /** Present only for EcoCash — the Paynow-hosted checkout page to open. */
  checkoutUrl: z.string().optional(),
});
export type PaySubscriptionResponse = z.infer<typeof paySubscriptionResponseSchema>;

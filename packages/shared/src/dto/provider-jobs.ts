import { z } from 'zod';
import { bookingStatusSchema, paymentMethodSchema } from './bookings.js';

/**
 * A booking as the STYLIST sees it. Deliberately not BookingRowDto: that one
 * describes the counterparty as the provider and carries client-side
 * affordances (rate, travel, cancel). Here the counterparty is the client and
 * the available actions are the opposite side of the same booking.
 */
export const providerBookingRowSchema = z.object({
  id: z.uuid(),
  reference: z.string(),
  clientName: z.string(),
  serviceName: z.string(),
  whenLabel: z.string(),
  startsAt: z.iso.datetime(),
  paymentMethod: paymentMethodSchema,
  priceUsdCents: z.number().int(),
  status: bookingStatusSchema,
  confirmedByClient: z.boolean(),
  confirmedByProvider: z.boolean(),
  /** Server-decided so the buttons a stylist sees and the rules the API enforces cannot drift. */
  canConfirm: z.boolean(),
  canDecline: z.boolean(),
  canConfirmCompletion: z.boolean(),
});
export type ProviderBookingRowDto = z.infer<typeof providerBookingRowSchema>;

/** A live smart-match offer waiting on this stylist. */
export const providerOfferSchema = z.object({
  id: z.uuid(),
  matchId: z.uuid(),
  categoryName: z.string(),
  /** Null when the client asked for a flexible budget. Cents, like every other amount here. */
  budgetUsdCents: z.number().int().nullable(),
  quoteUsdCents: z.number().int(),
  distanceKm: z.number(),
  /** When this offer stops being answerable — the screen counts down to it. */
  respondBy: z.iso.datetime(),
});
export type ProviderOfferDto = z.infer<typeof providerOfferSchema>;

export const providerAvailabilitySchema = z.object({
  acceptingBookings: z.boolean(),
});
export type ProviderAvailabilityDto = z.infer<typeof providerAvailabilitySchema>;

/** Everything the Jobs screen needs, in one request — it is a dashboard, not five lists. */
export const providerJobsSchema = z.object({
  acceptingBookings: z.boolean(),
  offers: z.array(providerOfferSchema),
  bookings: z.array(providerBookingRowSchema),
});
export type ProviderJobsDto = z.infer<typeof providerJobsSchema>;

/**
 * One row of the append-only Payment ledger (plan §6), narrowed to a single
 * provider and given a name they recognise instead of a raw booking/order
 * id — a booking or a market order, whichever produced this entry.
 */
export const providerEarningsEntrySchema = z.object({
  id: z.uuid(),
  reference: z.string(),
  kind: z.enum(['booking', 'order']),
  counterpartyName: z.string(),
  amountUsdCents: z.number().int(),
  feeUsdCents: z.number().int(),
  status: z.enum(['held', 'released', 'refunded', 'failed']),
  createdAt: z.iso.datetime(),
});
export type ProviderEarningsEntryDto = z.infer<typeof providerEarningsEntrySchema>;

/**
 * `releasedUsdCents` is money actually settled to the provider (net of the
 * platform fee); `pendingUsdCents` is still held in escrow — a booking or
 * order in progress, not yet collected/completed. Neither total counts a
 * refunded or failed entry.
 */
export const providerEarningsSchema = z.object({
  releasedUsdCents: z.number().int(),
  pendingUsdCents: z.number().int(),
  entries: z.array(providerEarningsEntrySchema),
});
export type ProviderEarningsDto = z.infer<typeof providerEarningsSchema>;

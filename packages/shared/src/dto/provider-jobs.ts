import { z } from 'zod';
import { bookingStatusSchema, paymentMethodSchema } from './bookings.js';
import { imageUrlSchema } from './uploads.js';

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
  clientImageUrl: imageUrlSchema.optional(),
  serviceName: z.string(),
  whenLabel: z.string(),
  startsAt: z.iso.datetime(),
  paymentMethod: paymentMethodSchema,
  /** The stylist's own price. */
  priceUsdCents: z.number().int(),
  /** Service fee on this job, billed to the stylist monthly (0 on older jobs paid online in the app). */
  serviceFeeUsdCents: z.number().int(),
  /** Coins the client spent on this job, and their cash value. */
  coinsUsed: z.number().int(),
  coinsUsdCents: z.number().int(),
  /** What the client should hand over: price plus fee, minus coins. 0 for older jobs paid online in the app. */
  amountToCollectUsdCents: z.number().int(),
  status: bookingStatusSchema,
  confirmedByClient: z.boolean(),
  confirmedByProvider: z.boolean(),
  /** ISO time the stylist reported non-payment, if they did. */
  nonPaymentReportedAt: z.iso.datetime().nullable(),
  /** Server-decided so the buttons a stylist sees and the rules the API enforces cannot drift. */
  canConfirm: z.boolean(),
  canDecline: z.boolean(),
  canConfirmCompletion: z.boolean(),
  /** Still inside the window for saying the client did not pay. */
  canReportNonPayment: z.boolean(),
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

export const reportNonPaymentSchema = z.object({
  note: z.string().trim().max(500).optional(),
});
export type ReportNonPaymentInput = z.infer<typeof reportNonPaymentSchema>;

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
  status: z.enum(['pending', 'paid', 'held', 'released', 'refunded', 'failed', 'disputed']),
  createdAt: z.iso.datetime(),
  /** True once admin-recorded payouts cover this released entry (oldest released entries are covered first). */
  paidOut: z.boolean(),
});
export type ProviderEarningsEntryDto = z.infer<typeof providerEarningsEntrySchema>;

/**
 * `releasedUsdCents` is money actually settled to the provider — the full
 * booking/order amount, no platform cut; `pendingUsdCents` is still held in
 * escrow — a booking or order in progress, not yet collected/completed.
 * Neither total counts a refunded or failed entry.
 */
export const providerEarningsSchema = z.object({
  /** Released from escrow into the provider's balance — earned, but not necessarily paid out yet. */
  releasedUsdCents: z.number().int(),
  pendingUsdCents: z.number().int(),
  /** What an admin has recorded as actually transferred to the provider (Payout rows). */
  paidOutUsdCents: z.number().int(),
  /** Released but not yet covered by a recorded payout. */
  awaitingPayoutUsdCents: z.number().int(),
  entries: z.array(providerEarningsEntrySchema),
});
export type ProviderEarningsDto = z.infer<typeof providerEarningsSchema>;

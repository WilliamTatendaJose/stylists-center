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

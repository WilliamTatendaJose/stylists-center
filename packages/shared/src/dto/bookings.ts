import { z } from 'zod';

export const paymentMethodSchema = z.enum(['ecocash', 'cash']);
export const bookingStatusSchema = z.enum([
  'awaiting_provider',
  'confirmed',
  'completed',
  'declined',
  'cancelled',
]);

export const createBookingSchema = z.object({
  providerId: z.uuid(),
  serviceId: z.uuid(),
  /** ISO-8601 UTC. Client-side display goes through formatInHarare(), never a raw Date. */
  startsAt: z.iso.datetime(),
  paymentMethod: paymentMethodSchema,
  matchId: z.uuid().optional(),
});
export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export const createBookingResponseSchema = z.object({
  id: z.uuid(),
  reference: z.string(),
  status: bookingStatusSchema,
});
export type CreateBookingResponse = z.infer<typeof createBookingResponseSchema>;

export const bookingRowSchema = z.object({
  id: z.uuid(),
  /** The provider's ProviderProfile id — lets a screen route to that provider's directions/chat/trip without a separate client-side id map. */
  providerId: z.uuid(),
  counterpartyName: z.string(),
  tint: z.string(),
  initials: z.string(),
  serviceName: z.string(),
  whenLabel: z.string(),
  paymentMethod: paymentMethodSchema,
  priceUsdCents: z.number().int(),
  status: bookingStatusSchema,
  confirmedByClient: z.boolean(),
  confirmedByProvider: z.boolean(),
  canTravel: z.boolean(),
  canRate: z.boolean(),
});
export type BookingRowDto = z.infer<typeof bookingRowSchema>;

export const confirmCompletionResponseSchema = z.object({
  confirmedByClient: z.boolean(),
  confirmedByProvider: z.boolean(),
  status: bookingStatusSchema,
});
export type ConfirmCompletionResponse = z.infer<typeof confirmCompletionResponseSchema>;

export const createReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  text: z.string().max(500).optional(),
});
export type CreateReviewInput = z.infer<typeof createReviewSchema>;

export const reportReasonSchema = z.enum(['no_show', 'misconduct', 'safety', 'other']);

export const createReportSchema = z.object({
  reportedUserId: z.uuid(),
  bookingId: z.uuid().optional(),
  reason: reportReasonSchema,
});
export type CreateReportInput = z.infer<typeof createReportSchema>;

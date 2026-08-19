import { z } from 'zod';
import { isValidMobileMoneyPhone } from '../domain/phone.js';
import { imageUrlSchema } from './uploads.js';

export const paymentMethodSchema = z.enum(['ecocash', 'cash']);

/**
 * The mobile money number to bill, when it differs from the account's login
 * number — someone may pay from a different line than the one they signed up
 * with, and the checkout has no business assuming they are the same. Accepts
 * local ("0771234567") or E.164; the API normalises before calling the gateway.
 */
export const payerPhoneSchema = z
  .string()
  .trim()
  .refine(isValidMobileMoneyPhone, { message: 'Enter a valid mobile number' });
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
  /** Required in practice for EcoCash — the number the prompt is sent to. Falls back to the account phone when absent. */
  payerPhone: payerPhoneSchema.optional(),
});
export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export const createBookingResponseSchema = z.object({
  id: z.uuid(),
  reference: z.string(),
  status: bookingStatusSchema,
  /** Present when Paynow returned a hosted checkout page instead of a phone prompt; the client must open it to complete checkout. */
  checkoutUrl: z.url().optional(),
  /** Present when Paynow pushed an EcoCash prompt to the client's phone — show this text while polling payment-status. */
  instructions: z.string().optional(),
});
export type CreateBookingResponse = z.infer<typeof createBookingResponseSchema>;

/**
 * `status` mirrors the Payment ledger's own vocabulary (a plain string in
 * Prisma, not an enum — see schema.prisma) rather than collapsing it, so a
 * screen can distinguish e.g. 'refunded' from 'failed' if it ever needs to.
 * 'none' covers a cash booking, which never has a Payment row.
 */
export const bookingPaymentStatusSchema = z.object({
  status: z.enum(['none', 'pending', 'held', 'paid', 'released', 'refunded', 'failed', 'disputed']),
});
export type BookingPaymentStatus = z.infer<typeof bookingPaymentStatusSchema>;

export const bookingRowSchema = z.object({
  id: z.uuid(),
  /** The provider's ProviderProfile id — lets a screen route to that provider's directions/chat/trip without a separate client-side id map. */
  providerId: z.uuid(),
  counterpartyName: z.string(),
  tint: z.string(),
  initials: z.string(),
  imageUrl: imageUrlSchema.optional(),
  serviceName: z.string(),
  whenLabel: z.string(),
  /**
   * ISO-8601 UTC. `whenLabel` is pre-formatted for display and cannot be
   * reasoned about — without this the client could not split upcoming from
   * past, sort, or say how long until an appointment.
   */
  startsAt: z.iso.datetime(),
  paymentMethod: paymentMethodSchema,
  priceUsdCents: z.number().int(),
  status: bookingStatusSchema,
  confirmedByClient: z.boolean(),
  confirmedByProvider: z.boolean(),
  canTravel: z.boolean(),
  canRate: z.boolean(),
  /** Whether this booking can still be called off. The server decides; the screen must not infer it from status. */
  canCancel: z.boolean(),
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

/**
 * Every M1 report target is a provider (the report sheet only ever opens
 * from a provider profile or a completed booking) — `providerId` is a
 * ProviderProfile id, same as `startConversationSchema`, and the API
 * resolves it to the real reportedId (a User id) server-side.
 */
export const createReportSchema = z.object({
  providerId: z.uuid(),
  bookingId: z.uuid().optional(),
  reason: reportReasonSchema,
});
export type CreateReportInput = z.infer<typeof createReportSchema>;

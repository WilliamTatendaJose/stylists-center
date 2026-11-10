import { z } from 'zod';

/**
 * How an online ("ecocash"-method) payment is actually made.
 *
 * `paymentMethod` stays a two-value enum (online vs cash) because bookings,
 * orders, stylist screens and the database enum all branch on it; the
 * wallet or card behind an online payment is this separate field instead, so
 * adding a network never touches any of those.
 *
 * - ecocash / onemoney: the gateway pushes an approval prompt to the phone.
 * - innbucks: the gateway returns an authorisation code the customer enters
 *   (or opens) in the InnBucks app.
 * - omari: O'mari texts a one-time code, which the customer types back into
 *   this app and the API forwards to the gateway.
 * - card: Visa/Mastercard on the gateway's hosted page — card details never
 *   touch this app.
 */
export const payChannelSchema = z.enum(['ecocash', 'onemoney', 'innbucks', 'omari', 'card']);
export type PayChannel = z.infer<typeof payChannelSchema>;

/** Channels that need a mobile number to bill. Card does not. */
export const PHONE_PAY_CHANNELS: ReadonlySet<PayChannel> = new Set([
  'ecocash',
  'onemoney',
  'innbucks',
  'omari',
]);

export const PAY_CHANNEL_LABELS: Record<PayChannel, string> = {
  ecocash: 'EcoCash',
  onemoney: 'OneMoney',
  innbucks: 'InnBucks',
  omari: "O'mari",
  card: 'Visa / Mastercard',
};

/** `GET /v1/payments/channels` — what the configured gateway can take right now. */
export const payChannelsResponseSchema = z.object({
  channels: z.array(payChannelSchema),
});
export type PayChannelsResponse = z.infer<typeof payChannelsResponseSchema>;

/**
 * Something the customer must do in this app (or another one) before the
 * gateway can settle a payment, beyond approving a phone prompt.
 */
export const paymentActionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('innbucks'),
    /** Shown to the customer and entered in, or deep-linked into, the InnBucks app. */
    authorizationCode: z.string(),
    /**
     * Paynow's expiry exactly as it sent it (e.g. "20-Sep-2026 14:35"). Shown
     * as text, never parsed: Paynow does not say which time zone it means,
     * and guessing wrong would expire a live code early.
     */
    expiresLabel: z.string().optional(),
  }),
  z.object({
    kind: z.literal('otp'),
    /** The reference O'mari printed in its SMS, so the customer knows which code to use. */
    otpReference: z.string().optional(),
  }),
]);
export type PaymentAction = z.infer<typeof paymentActionSchema>;

/** `POST /v1/payments/otp` — forwards the code O'mari texted the payer. */
export const submitPaymentOtpSchema = z.object({
  /** The booking/order/subscription reference the payment was started under. */
  reference: z.string().min(1).max(120),
  otp: z
    .string()
    .trim()
    .regex(/^\d{4,8}$/, { message: 'Enter the code from your SMS' }),
});
export type SubmitPaymentOtpInput = z.infer<typeof submitPaymentOtpSchema>;

import { parsePhoneNumberWithError, isValidPhoneNumber } from 'libphonenumber-js';

/**
 * Phone identity (SRS §3.6, handoff "auth"): phone number is the identity for
 * this market, matching both EcoCash and the eventual WhatsApp OTP channel
 * (plan risk R4). Default region ZW so a client can type a local-format
 * number ("077 000 0000") without the country code, but any valid E.164
 * number from another country is accepted as-is.
 */
const DEFAULT_REGION = 'ZW';

export function normalizePhone(input: string): string | null {
  try {
    const parsed = parsePhoneNumberWithError(input, DEFAULT_REGION);
    return parsed.isValid() ? parsed.number : null;
  } catch {
    return null;
  }
}

export function isValidPhone(input: string): boolean {
  return isValidPhoneNumber(input, DEFAULT_REGION);
}

/**
 * Stricter check for a number a mobile money prompt is sent to.
 *
 * `isValidPhone` is deliberately permissive — it guards login, where turning
 * away a real number is the worse failure. It is too permissive for a payment
 * field: the bundled libphonenumber metadata carries no number *type* for ZW
 * (`getType()` is undefined) and accepts both landlines and strings as short
 * as "12345". Neither can receive an EcoCash prompt, so match the shape of a
 * Zimbabwean mobile line directly: +263 7XXXXXXXX.
 */
export function isValidMobileMoneyPhone(input: string): boolean {
  const e164 = normalizePhone(input);
  return e164 !== null && /^\+2637\d{8}$/.test(e164);
}

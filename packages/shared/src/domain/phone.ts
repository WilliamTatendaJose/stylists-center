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

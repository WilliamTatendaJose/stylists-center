/**
 * Zimbabwean mobile money APIs expect a local "0771234567" number, not the
 * app's stored E.164 "+263771234567". Shared by every gateway adapter so a
 * number that works for one cannot silently be malformed for another.
 */
export function toLocalPhone(e164: string): string {
  return e164.startsWith('+263') ? `0${e164.slice(4)}` : e164;
}

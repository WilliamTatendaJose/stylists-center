import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * RFC 6238 TOTP (HMAC-SHA1, 6 digits, 30 s steps): what Google
 * Authenticator, 1Password, Authy and Microsoft Authenticator all speak.
 * Implemented on node:crypto rather than a dependency; the whole algorithm
 * is the 20 lines below, and the test vectors in totp.spec.ts pin it to the RFC.
 */
export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;
/** Steps either side of now that still count, to absorb phone clock drift. */
export const TOTP_WINDOW = 1;

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32.charAt((value >>> (bits - 5)) & 31);
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32.charAt((value << (5 - bits)) & 31);
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index === -1) throw new Error('Invalid base32 character');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A new 160-bit secret, base32-encoded (the length RFC 4226 recommends). */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function totpStep(nowMs: number): number {
  return Math.floor(nowMs / 1000 / TOTP_STEP_SECONDS);
}

export function totpCode(secretBase32: string, step: number, digits = TOTP_DIGITS): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac('sha1', base32Decode(secretBase32)).update(counter).digest();
  const offset = (hmac[hmac.length - 1] ?? 0) & 0x0f;
  const binary = hmac.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** digits).padStart(digits, '0');
}

/**
 * Returns the matching time-step, or null. A step at or before
 * `lastUsedStep` never matches, so each code works once.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  nowMs: number,
  lastUsedStep: number | null,
): number | null {
  const candidate = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(candidate)) return null;
  const current = totpStep(nowMs);
  for (let step = current - TOTP_WINDOW; step <= current + TOTP_WINDOW; step += 1) {
    if (lastUsedStep !== null && step <= lastUsedStep) continue;
    const expected = Buffer.from(totpCode(secretBase32, step));
    if (timingSafeEqual(expected, Buffer.from(candidate))) return step;
  }
  return null;
}

export function otpauthUrl(secretBase32: string, accountEmail: string): string {
  const issuer = 'Stylists Center';
  const label = encodeURIComponent(`${issuer}:${accountEmail}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

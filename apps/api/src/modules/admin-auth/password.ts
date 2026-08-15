import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

/**
 * scrypt rather than a bcrypt/argon2 dependency — the rest of the codebase
 * already leans on node:crypto directly for hashing (see auth.service.ts's
 * refresh-token peppering), and one admin login endpoint doesn't justify a
 * new dependency for this alone.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derivedKey = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  return `${salt.toString('hex')}:${derivedKey.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;

  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;

  // Buffers of different lengths would throw inside timingSafeEqual rather
  // than just comparing false — a mismatched stored hash must never crash
  // the login endpoint.
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

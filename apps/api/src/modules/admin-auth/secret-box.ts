import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM for small secrets at rest (admin TOTP secrets), so a database
 * leak alone doesn't hand over every admin's second factor. The key is
 * derived from ADMIN_JWT_REFRESH_PEPPER with HKDF rather than needing yet
 * another required variable. Rotating that pepper therefore invalidates
 * stored TOTP secrets as well as sessions: affected admins re-enrol after a
 * break-glass reset (see RAILWAY.md).
 */
const VERSION = 'v1';

export function deriveKey(pepper: string): Buffer {
  return Buffer.from(hkdfSync('sha256', pepper, 'sc-admin-totp', 'secret-box v1', 32));
}

export function seal(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    body.toString('base64url'),
  ].join('.');
}

export function open(sealed: string, key: Buffer): string {
  const [version, iv, tag, body] = sealed.split('.');
  if (version !== VERSION || !iv || !tag || !body) throw new Error('Unrecognised sealed value');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(body, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

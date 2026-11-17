import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { STORED_OBJECT_NAME, UPLOAD_URL_PREFIX } from './object-storage';

/** How long a signed link to an identity document stays valid. */
export const DOCUMENT_LINK_SECONDS = 60 * 60;
/** How long a signed link to a chat attachment stays valid (a thread left open all day keeps working). */
export const CHAT_LINK_SECONDS = 24 * 60 * 60;
/**
 * Expiries are rounded up to this, so the same object yields the same URL for
 * a while and clients' URL-keyed image caches keep working.
 */
const EXPIRY_BUCKET_SECONDS = 60 * 60;

const SIGNED_UPLOAD_URL = /^(\/uploads\/[^?#]+)\?exp=\d+&sig=[A-Za-z0-9_-]+$/;

/**
 * Turns a signed `/uploads/<name>?exp=…&sig=…` back into the stored form.
 * Clients send back URLs they were given (e.g. resubmitting verification), and
 * an installed app must not start failing validation because of the query.
 */
export function stripUploadSignature(value: unknown): unknown {
  return typeof value === 'string' ? value.replace(SIGNED_UPLOAD_URL, '$1') : value;
}

function uploadName(url: string | null | undefined): string | null {
  if (!url?.startsWith(UPLOAD_URL_PREFIX)) return null;
  const name = url.slice(UPLOAD_URL_PREFIX.length);
  return STORED_OBJECT_NAME.test(name) ? name : null;
}

/**
 * Capability links for private uploads.
 *
 * Every upload is served from the unauthenticated `/uploads/<name>` route,
 * because the app's image component and the console's <img> tags cannot send
 * an Authorization header. Public photos stay that way. Identity documents,
 * selfies and chat attachments are marked private: the route then also needs
 * an unexpired HMAC signature, which only the API mints, and only in responses
 * to the people allowed to see the object. A leaked or logged link therefore
 * stops working within hours instead of being valid forever.
 */
@Injectable()
export class UploadAccessService {
  private readonly key: Buffer;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.key = createHmac('sha256', config.get('JWT_ACCESS_SECRET', { infer: true }))
      .update('upload-links:v1')
      .digest();
  }

  /** Records who uploaded an object (and, for chat files, that it is private from the start). */
  async record(name: string, ownerId: string | undefined, isPrivate = false): Promise<void> {
    await this.prisma.upload.upsert({
      where: { name },
      create: { name, ownerId: ownerId ?? null, private: isPrivate },
      update: isPrivate ? { private: true } : {},
    });
  }

  /**
   * Makes the caller's own uploads private. Objects uploaded by someone else
   * (or before ownership was recorded) are left as they are: otherwise anyone
   * could hide another user's public photo by submitting its URL as a document.
   */
  async markPrivate(urls: (string | null | undefined)[], ownerId: string): Promise<void> {
    const names = urls.map(uploadName).filter((name): name is string => name !== null);
    if (names.length === 0) return;
    await this.prisma.upload.updateMany({
      where: { name: { in: names }, ownerId },
      data: { private: true },
    });
  }

  async isPrivate(name: string): Promise<boolean> {
    const row = await this.prisma.upload.findUnique({
      where: { name },
      select: { private: true },
    });
    return row?.private ?? false;
  }

  /** Appends a signature to an API-owned upload URL; any other value is returned unchanged. */
  sign(url: string, ttlSeconds: number, now?: number): string;
  sign(url: string | null, ttlSeconds: number, now?: number): string | null;
  sign(url: string | null, ttlSeconds: number, now = Date.now()): string | null {
    const name = uploadName(url);
    if (!url || !name) return url;
    const exp =
      Math.ceil((Math.floor(now / 1000) + ttlSeconds) / EXPIRY_BUCKET_SECONDS) *
      EXPIRY_BUCKET_SECONDS;
    return `${url}?exp=${String(exp)}&sig=${this.signature(name, exp)}`;
  }

  verify(name: string, exp: unknown, sig: unknown, now = Date.now()): boolean {
    if (typeof exp !== 'string' || typeof sig !== 'string' || !/^\d{1,12}$/.test(exp)) return false;
    const expiry = Number(exp);
    if (expiry * 1000 <= now) return false;
    const expected = Buffer.from(this.signature(name, expiry));
    const supplied = Buffer.from(sig);
    return expected.length === supplied.length && timingSafeEqual(expected, supplied);
  }

  private signature(name: string, exp: number): string {
    return createHmac('sha256', this.key)
      .update(`${name}\n${String(exp)}`)
      .digest('base64url');
  }
}

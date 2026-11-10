/**
 * Adds `variant=thumb` to API-owned upload URLs (`.../uploads/<name>`) so the
 * server answers with its ~480 px derivative instead of the full photo. It
 * falls back to the original for uploads made before thumbnails existed, so
 * this is always safe to apply. Other URLs (remote avatars, `file://`,
 * presigned bucket links) are returned untouched.
 *
 * Works on both origin-relative paths and absolute URLs, and keeps any
 * existing query string or fragment (`apiAssetUrl` returns plain URLs, but
 * callers may have added their own params).
 */
const UPLOAD_PATH = /\/uploads\/[^/?#]+(?=[?#]|$)/;

export function thumbnailUrl(uri: string): string;
export function thumbnailUrl(uri: string | undefined): string | undefined;
export function thumbnailUrl(uri: string | undefined): string | undefined {
  if (!uri || !UPLOAD_PATH.test(uri) || /[?&]variant=/.test(uri)) return uri;
  const hashAt = uri.indexOf('#');
  const base = hashAt === -1 ? uri : uri.slice(0, hashAt);
  const hash = hashAt === -1 ? '' : uri.slice(hashAt);
  return `${base}${base.includes('?') ? '&' : '?'}variant=thumb${hash}`;
}

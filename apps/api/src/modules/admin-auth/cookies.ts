import type { Request, Response } from 'express';

/**
 * The admin refresh token travels only as an httpOnly cookie — unlike the
 * mobile app (which has nowhere else to put it), a browser client must never
 * have script-readable access to a long-lived credential. `cookie-parser`
 * isn't worth adding as a dependency for exactly one cookie, so this reads
 * the raw `Cookie` header directly.
 */
const COOKIE_NAME = 'admin_refresh_token';
const COOKIE_PATH = '/v1/admin/auth';

export function readAdminRefreshCookie(req: Request): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;

  for (const part of header.split(';')) {
    const [rawName, ...rawValue] = part.trim().split('=');
    if (rawName === COOKIE_NAME) {
      return decodeURIComponent(rawValue.join('='));
    }
  }
  return undefined;
}

/**
 * 'lax' in development (admin and api are both localhost, just different
 * ports — same registrable domain, so 'lax' already works and 'none'
 * requires Secure, which plain http:// can't satisfy). 'none' once `secure`
 * is true: on Railway the admin console and API sit on different
 * *.up.railway.app subdomains, a genuinely cross-site relationship, and
 * 'lax' silently drops the cookie on the credentialed fetch() that does
 * session refresh — it only rides along on top-level navigations, not XHR.
 */
function sameSitePolicy(secure: boolean): 'lax' | 'none' {
  return secure ? 'none' : 'lax';
}

export function setAdminRefreshCookie(
  res: Response,
  token: string,
  expiresAt: Date,
  secure: boolean,
): void {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure,
    sameSite: sameSitePolicy(secure),
    path: COOKIE_PATH,
    expires: expiresAt,
  });
}

export function clearAdminRefreshCookie(res: Response, secure: boolean): void {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure,
    sameSite: sameSitePolicy(secure),
    path: COOKIE_PATH,
  });
}

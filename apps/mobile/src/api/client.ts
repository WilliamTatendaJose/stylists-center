import Constants from 'expo-constants';
import { fetch as expoFetch } from 'expo/fetch';
import { Platform } from 'react-native';
import { useAuthStore } from '../state/useAuthStore.js';
import { getStoredTokens, setStoredTokens, clearStoredTokens } from '../auth/tokenStorage.js';
import { ApiError, NetworkError, extractMessage } from './errors.js';

/**
 * Device -> API host, solved once (plan §7) so nobody hardcodes an IP: the
 * Metro host (read from `hostUri`) is the dev machine's LAN IP, which covers
 * physical devices on the same wifi with zero config. Falls back to the
 * Android emulator's host alias, then localhost. A release build must set
 * EXPO_PUBLIC_API_URL explicitly — there's no Metro host to infer from.
 */
function resolveBaseUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl?.trim()) return envUrl.trim().replace(/\/+$/, '');

  const hostUri = Constants.expoConfig?.hostUri;
  const host = hostUri?.split(':')[0];
  if (host) return `http://${host}:4000`;

  return Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000';
}

// Keep concatenated API and media URLs valid even when a deployment variable
// is entered as `https://api.example.com/`.
export const BASE_URL = resolveBaseUrl().replace(/\/+$/, '');

// A checked-in dev .env often uses localhost for USB `adb reverse`. When the
// reverse tunnel is missing on a physical device, the first request fails
// before it reaches the API; Metro already tells us the computer's LAN host,
// so retry once there and keep that origin for uploaded media too.
let activeBaseUrl = BASE_URL;
const metroFallbackUrl = (() => {
  const configured = (() => {
    try {
      return new URL(BASE_URL).hostname;
    } catch {
      return '';
    }
  })();
  if (!['localhost', '127.0.0.1', '10.0.2.2'].includes(configured)) return null;
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  return host ? `http://${host}:4000` : null;
})();

// Re-exported so callers keep importing their errors from the client they
// already use, while the definitions stay in a testable, RN-free module.
export { ApiError, NetworkError };

interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}

// De-dupes concurrent 401s into a single refresh call instead of a stampede.
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(baseUrl = activeBaseUrl): Promise<string | null> {
  const stored = await getStoredTokens();
  if (!stored) return null;

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: stored.refreshToken }),
    });
  } catch (cause) {
    // Deliberately does NOT clear the session: an unreachable server says
    // nothing about whether the refresh token is still valid, and signing the
    // user out every time they walk into a tunnel would be its own bug.
    throw new NetworkError(cause);
  }

  if (!res.ok) {
    await clearStoredTokens();
    useAuthStore.setState({ accessToken: null });
    return null;
  }

  const tokens = (await res.json()) as RefreshResponse;
  await setStoredTokens(tokens);
  useAuthStore.setState({ accessToken: tokens.accessToken });
  return tokens.accessToken;
}

export interface ApiFetchOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** false for the OTP endpoints themselves, which run before a session exists. */
  auth?: boolean;
}

/**
 * The one place every real (Phase 3-cutover) request goes through. A 401
 * triggers exactly one refresh-and-retry — if that also fails, the session
 * is gone and the caller sees the original 401 rather than looping.
 */
export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true } = options;
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  const headers: Record<string, string> = isFormData ? {} : { 'Content-Type': 'application/json' };

  if (auth) {
    const token = useAuthStore.getState().accessToken;
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const doFetch = async () => {
    try {
      // Expo's native fetch can stream URI-backed FormData parts on Android.
      // React Native's global fetch rejects those parts before the request is
      // sent, which made image uploads surface as a generic network failure.
      const request = isFormData ? expoFetch : fetch;
      return await request(`${activeBaseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
      });
    } catch (cause) {
      // fetch only rejects when the request never completed; every HTTP status,
      // including 5xx, resolves normally and is handled below.
      throw new NetworkError(cause);
    }
  };

  let res: Response;
  try {
    res = await doFetch();
  } catch (error) {
    if (!metroFallbackUrl || metroFallbackUrl === activeBaseUrl) throw error;
    activeBaseUrl = metroFallbackUrl;
    res = await doFetch();
  }

  if (res.status === 401 && auth) {
    refreshPromise ??= refreshAccessToken().finally(() => {
      refreshPromise = null;
    });
    const newToken = await refreshPromise;
    if (newToken) {
      headers.Authorization = `Bearer ${newToken}`;
      res = await doFetch();
    }
  }

  if (!res.ok) {
    const text = await res.text();
    throw new ApiError(res.status, extractMessage(text, res.status, res.statusText));
  }

  // Nest's default status for a `void`-returning POST/PATCH/DELETE handler is
  // 200/201, not 204 — checking status alone missed those, so a successful
  // empty-body response (e.g. submitting a review) tried to JSON-parse ""
  // and threw, surfacing as a failure even though the request had already
  // gone through server-side. Any empty body means "nothing to parse" now,
  // regardless of which success status carried it.
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

/** Resolves API-owned origin-relative media without baking a dev-machine host into the database. */
export function apiAssetUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  return url.startsWith('/') ? `${activeBaseUrl}${url}` : url;
}

import Constants from 'expo-constants';
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
  if (envUrl) return envUrl;

  const hostUri = Constants.expoConfig?.hostUri;
  const host = hostUri?.split(':')[0];
  if (host) return `http://${host}:4000`;

  return Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000';
}

export const BASE_URL = resolveBaseUrl();

// Re-exported so callers keep importing their errors from the client they
// already use, while the definitions stay in a testable, RN-free module.
export { ApiError, NetworkError };

interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}

// De-dupes concurrent 401s into a single refresh call instead of a stampede.
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const stored = await getStoredTokens();
  if (!stored) return null;

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/v1/auth/refresh`, {
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
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (auth) {
    const token = useAuthStore.getState().accessToken;
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const doFetch = async () => {
    try {
      return await fetch(`${BASE_URL}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (cause) {
      // fetch only rejects when the request never completed; every HTTP status,
      // including 5xx, resolves normally and is handled below.
      throw new NetworkError(cause);
    }
  };

  let res = await doFetch();

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

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

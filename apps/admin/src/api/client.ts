import { useAuthStore } from '../state/authStore';

const BASE_URL: string = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:4000';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ApiFetchOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** false for /admin/auth/login and /admin/auth/refresh themselves, which run before an access token exists. */
  auth?: boolean;
}

function extractMessage(text: string, status: number, statusText: string): string {
  if (!text) return statusText || `Request failed (${String(status)})`;
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && 'message' in parsed) {
      const { message } = parsed;
      if (typeof message === 'string') return message;
      if (Array.isArray(message)) return message.join(', ');
    }
  } catch {
    // Not JSON — fall through to the raw text.
  }
  return text;
}

// De-dupes concurrent 401s into a single refresh call instead of a stampede,
// same reasoning as the mobile client.
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/v1/admin/auth/refresh`, {
      method: 'POST',
      // The refresh token itself never leaves the httpOnly cookie — this is
      // what makes the browser attach it.
      credentials: 'include',
    });
  } catch {
    return null;
  }

  if (!res.ok) {
    useAuthStore.getState().clear();
    return null;
  }

  const data = (await res.json()) as { accessToken: string };
  useAuthStore.getState().setAccessToken(data.accessToken);
  return data.accessToken;
}

/**
 * The one place every admin console request goes through. Mirrors the
 * mobile app's apiFetch (single refresh-and-retry on 401), except the
 * refresh token travels as a cookie rather than a value this code ever
 * touches directly.
 */
export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true } = options;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (auth) {
    const token = useAuthStore.getState().accessToken;
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const doFetch = () =>
    fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      credentials: 'include',
      body: body ? JSON.stringify(body) : null,
    });

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

  // Nest's default status for a `void`-returning POST/PATCH/DELETE handler is
  // 200/201, not 204 — checking status alone missed those, so a successful
  // empty-body response tried to JSON-parse "" and threw, surfacing as a
  // failure even though the request had already gone through server-side.
  // Any empty body means "nothing to parse" now, regardless of which success
  // status carried it.
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

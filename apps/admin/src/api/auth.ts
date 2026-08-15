import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AdminIdentity, AdminLoginInput, AdminSession } from '@sc/shared';
import { apiFetch } from './client';
import { useAuthStore } from '../state/authStore';

export function useLogin() {
  const setSession = useAuthStore((s) => s.setSession);

  return useMutation({
    mutationFn: (input: AdminLoginInput) =>
      apiFetch<AdminSession>('/v1/admin/auth/login', { method: 'POST', body: input, auth: false }),
    onSuccess: (session) => {
      setSession(session.accessToken, session.admin);
    },
  });
}

export function useLogout() {
  const clear = useAuthStore((s) => s.clear);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => apiFetch<{ ok: boolean }>('/v1/admin/auth/logout', { method: 'POST' }),
    onSettled: () => {
      // Logs out locally even if the network call fails — there is no
      // scenario where staying "logged in" in the browser tab is the safer
      // failure mode.
      clear();
      queryClient.clear();
    },
  });
}

/**
 * Runs once when the app first loads. The access token lives only in memory,
 * so a page refresh has none — this is what turns the still-valid httpOnly
 * refresh cookie back into a working session instead of forcing a re-login
 * every reload.
 */
export async function bootstrapSession(): Promise<void> {
  const { setAccessToken, setSession, finishBootstrapping } = useAuthStore.getState();
  try {
    const refreshRes = await fetch(
      `${import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:4000'}/v1/admin/auth/refresh`,
      { method: 'POST', credentials: 'include' },
    );
    if (!refreshRes.ok) return;

    const { accessToken } = (await refreshRes.json()) as { accessToken: string };
    // Set before calling /me so apiFetch's Authorization header is populated.
    setAccessToken(accessToken);
    const admin = await apiFetch<AdminIdentity>('/v1/admin/auth/me');
    setSession(accessToken, admin);
  } catch {
    // No valid session to resume — the login screen is the correct outcome.
  } finally {
    finishBootstrapping();
  }
}

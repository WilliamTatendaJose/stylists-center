import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  AdminChangePasswordInput,
  AdminIdentity,
  AdminLoginInput,
  AdminLoginResult,
  AdminMfaDisableInput,
  AdminMfaLoginInput,
  AdminMfaSetup,
  AdminRecoveryCodes,
  AdminSession,
} from '@sc/shared';
import { apiFetch } from './client';
import { useAuthStore } from '../state/authStore';

/** Password step. Resolves to a session, or to a 2FA challenge the caller completes with useMfaLogin. */
export function useLogin() {
  const setSession = useAuthStore((s) => s.setSession);

  return useMutation({
    mutationFn: (input: AdminLoginInput) =>
      apiFetch<AdminLoginResult>('/v1/admin/auth/login', {
        method: 'POST',
        body: input,
        auth: false,
      }),
    onSuccess: (result) => {
      if ('accessToken' in result) setSession(result.accessToken, result.admin);
    },
  });
}

export function useMfaLogin() {
  const setSession = useAuthStore((s) => s.setSession);

  return useMutation({
    mutationFn: (input: AdminMfaLoginInput) =>
      apiFetch<AdminSession>('/v1/admin/auth/login/mfa', {
        method: 'POST',
        body: input,
        auth: false,
      }),
    onSuccess: (session) => {
      setSession(session.accessToken, session.admin);
    },
  });
}

export function useMfaSetup() {
  return useMutation({
    mutationFn: () => apiFetch<AdminMfaSetup>('/v1/admin/auth/mfa/setup', { method: 'POST' }),
  });
}

/**
 * Doesn't update the signed-in admin itself: the caller must first store the
 * recovery codes, then mark 2FA on. Flipping mfaEnabled here (hook-level
 * onSuccess runs before the caller's) unmounted the setup form before its
 * own onSuccess could run, and the one-time codes were never shown.
 */
export function useMfaEnable() {
  return useMutation({
    mutationFn: (code: string) =>
      apiFetch<AdminRecoveryCodes>('/v1/admin/auth/mfa/enable', {
        method: 'POST',
        body: { code },
      }),
  });
}

export function useRegenerateRecoveryCodes() {
  return useMutation({
    mutationFn: (code: string) =>
      apiFetch<AdminRecoveryCodes>('/v1/admin/auth/mfa/recovery-codes', {
        method: 'POST',
        body: { code },
      }),
  });
}

export function useMfaDisable() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AdminMfaDisableInput) =>
      apiFetch<{ ok: boolean }>('/v1/admin/auth/mfa/disable', { method: 'POST', body: input }),
    onSuccess: async () => {
      // /me knows whether ADMIN_MFA_REQUIRED now applies to this account.
      const admin = await apiFetch<AdminIdentity>('/v1/admin/auth/me');
      useAuthStore.getState().updateAdmin(admin);
      await queryClient.invalidateQueries();
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

/**
 * Changes your own password. Every other session for the account is signed
 * out; this tab gets the fresh session the API returns, so it stays signed in.
 */
export function useChangePassword() {
  const setSession = useAuthStore((s) => s.setSession);
  return useMutation({
    mutationFn: (input: AdminChangePasswordInput) =>
      apiFetch<AdminSession>('/v1/admin/auth/password', { method: 'POST', body: input }),
    onSuccess: (session) => {
      setSession(session.accessToken, session.admin);
    },
  });
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ActiveRole, Me, UpdateProfileInput } from '@sc/shared';
import { apiFetch } from '../client.js';
import { confirmAfterTimeout } from '../confirmAfterTimeout.js';
import { useAuthStore } from '../../state/useAuthStore.js';

export const ME_QUERY_KEY = ['me'] as const;

/**
 * `GET /v1/me` — the server's view of the signed-in user.
 *
 * The role pill and the role switcher used to read a client-only zustand
 * field that defaulted to 'client' and a `hasProviderProfile` that was
 * hardcoded false, so the UI could contradict the account it was signed in
 * as. The server has known both all along; this is what asks it.
 */
export function useMe() {
  const accessToken = useAuthStore((state) => state.accessToken);
  return useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: () => apiFetch<Me>('/v1/me'),
    enabled: !!accessToken,
    // Identity changes rarely and only through this app, so a refetch on
    // every screen focus is wasted data on a metered connection.
    staleTime: 5 * 60 * 1000,
  });
}

/** `POST /v1/me/role` — returns the updated Me, so the cache is seeded from the response. */
export function useSetActiveRole() {
  const queryClient = useQueryClient();

  return useMutation({
    /**
     * Switching roles is the action users saw "fail" and then find had worked.
     * The request is cheap for the server but the response has to survive a
     * round trip on a connection that frequently does not: when the deadline
     * passes, the switch has usually already been committed, and reporting
     * that as an error left the app showing the old role (useMe's staleTime is
     * five minutes) until something happened to refetch — at which point the
     * role appeared to change on its own.
     *
     * A timeout is not an answer, so this goes and gets one. The role endpoint
     * sets a value rather than toggling, so asking again is safe, and if the
     * server already holds the role that was asked for then the switch
     * happened and there is nothing to report. Anything else — including a
     * server that says the role is still the old one — is a real failure and
     * still throws.
     */
    mutationFn: (role: ActiveRole) =>
      apiFetch<Me>('/v1/me/role', { method: 'POST', body: { role } }).catch((error: unknown) =>
        confirmAfterTimeout(
          error,
          () => apiFetch<Me>('/v1/me'),
          (me) => me.activeRole === role,
        ),
      ),
    onSuccess: (me) => {
      queryClient.setQueryData(ME_QUERY_KEY, me);
      // Role decides which side of the marketplace the rest of the app is
      // showing, so anything already fetched under the old role is suspect.
      // `refetchType: 'none'` still marks every query invalidated (so the
      // next mount/access refetches instead of serving stale role data) —
      // but skips forcing an immediate refetch of every currently-active
      // query at once. That immediate burst was competing on the network
      // with the destination screen's own queries right as it mounted,
      // which is what made switching roles feel like it hung.
      void queryClient.invalidateQueries({ refetchType: 'none' });
    },
  });
}

/** `PATCH /v1/me` — the Complete Profile screen's only field today: a real display name. */
export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateProfileInput) =>
      apiFetch<Me>('/v1/me', { method: 'PATCH', body: input }),
    onSuccess: (me) => {
      queryClient.setQueryData(ME_QUERY_KEY, me);
    },
  });
}

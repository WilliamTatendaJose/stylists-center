import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ActiveRole, Me, UpdateProfileInput } from '@sc/shared';
import { apiFetch } from '../client.js';

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
  return useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: () => apiFetch<Me>('/v1/me'),
    // Identity changes rarely and only through this app, so a refetch on
    // every screen focus is wasted data on a metered connection.
    staleTime: 5 * 60 * 1000,
  });
}

/** `POST /v1/me/role` — returns the updated Me, so the cache is seeded from the response. */
export function useSetActiveRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (role: ActiveRole) =>
      apiFetch<Me>('/v1/me/role', { method: 'POST', body: { role } }),
    onSuccess: (me) => {
      queryClient.setQueryData(ME_QUERY_KEY, me);
      // Role decides which side of the marketplace the rest of the app is
      // showing, so anything already fetched under the old role is suspect.
      void queryClient.invalidateQueries();
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

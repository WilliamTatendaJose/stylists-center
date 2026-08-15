import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminProviderRowDto, UpdateProviderAdminInput } from '@sc/shared';
import { apiFetch } from './client';

const PROVIDERS_KEY = ['admin', 'providers'] as const;

export function useProviders(verified?: boolean) {
  return useQuery({
    queryKey: [...PROVIDERS_KEY, verified ?? 'all'],
    queryFn: () =>
      apiFetch<AdminProviderRowDto[]>(
        `/v1/admin/providers${verified !== undefined ? `?verified=${String(verified)}` : ''}`,
      ),
  });
}

export function useUpdateProvider(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProviderAdminInput) =>
      apiFetch<AdminProviderRowDto>(`/v1/admin/providers/${id}`, { method: 'PATCH', body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PROVIDERS_KEY });
    },
  });
}

/** Grants a fresh 30-day subscription cycle outside the provider's own in-app payment flow — a payment received out-of-band, or a courtesy extension. */
export function useExtendSubscription(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<AdminProviderRowDto>(`/v1/admin/providers/${id}/subscription/extend`, {
        method: 'POST',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PROVIDERS_KEY });
    },
  });
}

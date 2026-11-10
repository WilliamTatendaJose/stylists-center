import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdminProviderRowDto,
  AdminSubscriptionSummaryDto,
  Paged,
  UpdateProviderAdminInput,
} from '@sc/shared';
import { apiFetch } from './client';
import { listQuery, type ListParams } from './paging';

const PROVIDERS_KEY = ['admin', 'providers'] as const;

export function useProviders(
  params: ListParams & {
    verified?: boolean | undefined;
    subscription?: 'active' | 'lapsed' | undefined;
  } = {},
) {
  return useQuery({
    queryKey: [...PROVIDERS_KEY, params],
    queryFn: () => apiFetch<Paged<AdminProviderRowDto>>(`/v1/admin/providers${listQuery(params)}`),
    placeholderData: keepPreviousData,
  });
}

export function useSubscriptionSummary() {
  return useQuery({
    queryKey: [...PROVIDERS_KEY, 'subscription-summary'],
    queryFn: () =>
      apiFetch<AdminSubscriptionSummaryDto>('/v1/admin/providers/subscription-summary'),
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

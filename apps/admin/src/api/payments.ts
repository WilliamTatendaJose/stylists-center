import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminPaymentsOverviewDto, AdminProviderPayoutRowDto, RecordPayoutInput } from '@sc/shared';
import { apiFetch } from './client';

const OVERVIEW_KEY = ['admin', 'payments', 'overview'] as const;
const PROVIDERS_KEY = ['admin', 'payments', 'providers'] as const;

export function usePaymentsOverview() {
  return useQuery({
    queryKey: OVERVIEW_KEY,
    queryFn: () => apiFetch<AdminPaymentsOverviewDto>('/v1/admin/payments/overview'),
  });
}

export function useProviderPayouts() {
  return useQuery({
    queryKey: PROVIDERS_KEY,
    queryFn: () => apiFetch<AdminProviderPayoutRowDto[]>('/v1/admin/payments/providers'),
  });
}

/** Records that a provider was actually paid outside the app — see the Payout model's doc comment for why this never touches the escrow ledger. */
export function useRecordPayout(providerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RecordPayoutInput) =>
      apiFetch(`/v1/admin/payments/providers/${providerId}/payouts`, { method: 'POST', body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PROVIDERS_KEY });
      void queryClient.invalidateQueries({ queryKey: OVERVIEW_KEY });
    },
  });
}

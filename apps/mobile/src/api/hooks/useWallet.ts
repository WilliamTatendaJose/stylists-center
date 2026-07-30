import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CashOutRequestResponse, ReferralRowDto, WalletDto } from '@sc/shared';
import { apiFetch } from '../client.js';

/** `GET /v1/wallet`. */
export function useWallet() {
  return useQuery({
    queryKey: ['wallet'],
    queryFn: () => apiFetch<WalletDto>('/v1/wallet'),
  });
}

/** `GET /v1/wallet/referrals`. */
export function useReferrals() {
  return useQuery({
    queryKey: ['wallet', 'referrals'],
    queryFn: () => apiFetch<ReferralRowDto[]>('/v1/wallet/referrals'),
  });
}

/** `POST /v1/wallet/cash-out` — the server recomputes the balance, never trusting a client-supplied amount. */
export function useCashOut() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => apiFetch<CashOutRequestResponse>('/v1/wallet/cash-out', { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['wallet'] });
    },
  });
}

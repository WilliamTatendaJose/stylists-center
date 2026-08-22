import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CashOutRequestResponse,
  ClaimReferralInput,
  EnrollAgentInput,
  ReferralRowDto,
  WalletDto,
  WalletTransactionDto,
} from '@sc/shared';
import { apiFetch } from '../client.js';

/** `GET /v1/wallet`. */
export function useWallet() {
  return useQuery({
    queryKey: ['wallet'],
    queryFn: () => apiFetch<WalletDto>('/v1/wallet'),
    // A completed booking can release a commission while this screen is
    // cached; always refresh the header when Rewards opens.
    refetchOnMount: 'always',
  });
}

/** `GET /v1/wallet/referrals`. */
export function useReferrals() {
  return useQuery({
    queryKey: ['wallet', 'referrals'],
    queryFn: () => apiFetch<ReferralRowDto[]>('/v1/wallet/referrals'),
  });
}

/** `GET /v1/wallet/transactions` — the append-only reward and cash-out ledger. */
export function useWalletTransactions() {
  return useQuery({
    queryKey: ['wallet', 'transactions'],
    queryFn: () => apiFetch<WalletTransactionDto[]>('/v1/wallet/transactions'),
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

export function useEnrollAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: EnrollAgentInput) =>
      apiFetch<WalletDto>('/v1/wallet/enroll', { method: 'POST', body: input }),
    onSuccess: (wallet) => {
      queryClient.setQueryData(['wallet'], wallet);
      void queryClient.invalidateQueries({ queryKey: ['wallet', 'referrals'] });
    },
  });
}

/** `POST /v1/wallet/referrals/claim` — links an invite before verification or agent enrollment. */
export function useClaimReferral() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ClaimReferralInput) =>
      apiFetch<WalletDto>('/v1/wallet/referrals/claim', { method: 'POST', body: input }),
    onSuccess: (wallet) => {
      queryClient.setQueryData(['wallet'], wallet);
      void queryClient.invalidateQueries({ queryKey: ['wallet', 'referrals'] });
      void queryClient.invalidateQueries({ queryKey: ['wallet', 'transactions'] });
    },
  });
}

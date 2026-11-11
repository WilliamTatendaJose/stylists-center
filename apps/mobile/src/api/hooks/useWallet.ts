import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AgentSubscriptionDto,
  AgentSubscriptionStatusDto,
  PayAgentSubscriptionInput,
  PayAgentSubscriptionResponse,
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

const AGENT_SUBSCRIPTION_KEY = ['wallet', 'agent-subscription'] as const;

/** `GET /v1/wallet/agent-subscription` — the agent's rewards subscription. Only agents have one. */
export function useAgentSubscription(enabled = true) {
  return useQuery({
    queryKey: AGENT_SUBSCRIPTION_KEY,
    queryFn: () => apiFetch<AgentSubscriptionDto>('/v1/wallet/agent-subscription'),
    enabled,
  });
}

/** `POST /v1/wallet/agent-subscription/pay`. Starting a payment does not extend cover; the status poll does. */
export function usePayAgentSubscription() {
  return useMutation({
    mutationFn: (input: PayAgentSubscriptionInput) =>
      apiFetch<PayAgentSubscriptionResponse>('/v1/wallet/agent-subscription/pay', {
        method: 'POST',
        body: input,
      }),
  });
}

const SETTLED_STATUSES = new Set<AgentSubscriptionStatusDto['status']>([
  'held',
  'paid',
  'released',
  'refunded',
  'failed',
  'disputed',
]);

/** Polls while a subscription payment is in flight; stops once it settles either way. */
export function useAgentSubscriptionPaymentStatus(enabled: boolean) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: [...AGENT_SUBSCRIPTION_KEY, 'payment-status'],
    queryFn: async () => {
      const result = await apiFetch<AgentSubscriptionStatusDto>(
        '/v1/wallet/agent-subscription/payment-status',
      );
      if (SETTLED_STATUSES.has(result.status)) {
        void queryClient.invalidateQueries({ queryKey: ['wallet'] });
      }
      return result;
    },
    enabled,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && SETTLED_STATUSES.has(status) ? false : 3000;
    },
  });
}

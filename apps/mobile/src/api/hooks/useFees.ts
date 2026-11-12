import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  FeeEntryDto,
  FeePaymentStatusDto,
  FeeStatementDto,
  FeeSummaryDto,
  PayFeesInput,
  PayFeesResponse,
} from '@sc/shared';
import { apiFetch } from '../client.js';

const FEES_KEY = ['provider', 'fees'] as const;
const ENTRIES_PAGE_SIZE = 30;

/** What the stylist or vendor owes right now, this month so far, and whether they are restricted. */
export function useFeeSummary() {
  return useQuery({
    queryKey: [...FEES_KEY, 'summary'],
    queryFn: () => apiFetch<FeeSummaryDto>('/v1/provider/fees'),
  });
}

export function useFeeStatements() {
  return useQuery({
    queryKey: [...FEES_KEY, 'statements'],
    queryFn: () => apiFetch<FeeStatementDto[]>('/v1/provider/fees/statements'),
  });
}

/** Every fee, waiver and payment, newest first. */
export function useFeeEntries() {
  return useInfiniteQuery({
    queryKey: [...FEES_KEY, 'entries'],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      apiFetch<{ items: FeeEntryDto[]; nextOffset: number | null }>(
        `/v1/provider/fees/entries?limit=${String(ENTRIES_PAGE_SIZE)}&offset=${String(pageParam)}`,
      ),
    getNextPageParam: (last) => last.nextOffset,
  });
}

export function usePayFees() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PayFeesInput) =>
      apiFetch<PayFeesResponse>('/v1/provider/fees/pay', { method: 'POST', body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: FEES_KEY });
    },
  });
}

const TERMINAL_PAYMENT_STATUSES = new Set<FeePaymentStatusDto['status']>([
  'held',
  'paid',
  'released',
  'refunded',
  'failed',
  'disputed',
]);

/**
 * Polls while a fee payment is in flight. The balance is only credited once
 * the gateway confirms, so this is how the screen learns it went through;
 * it stops as soon as the status settles either way.
 */
export function useFeePaymentStatus(enabled: boolean) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: [...FEES_KEY, 'payment-status'],
    queryFn: async () => {
      const result = await apiFetch<FeePaymentStatusDto>('/v1/provider/fees/payment-status');
      if (TERMINAL_PAYMENT_STATUSES.has(result.status)) {
        void queryClient.invalidateQueries({ queryKey: [...FEES_KEY, 'summary'] });
        void queryClient.invalidateQueries({ queryKey: [...FEES_KEY, 'entries'] });
        void queryClient.invalidateQueries({ queryKey: [...FEES_KEY, 'statements'] });
      }
      return result;
    },
    enabled,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && TERMINAL_PAYMENT_STATUSES.has(status) ? false : 3000;
    },
  });
}

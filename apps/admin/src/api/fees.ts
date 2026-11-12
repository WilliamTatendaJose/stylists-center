import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdjustFeesInput,
  AdminFeeDetailDto,
  AdminFeeRowDto,
  AdminFeeSummaryDto,
  Paged,
  RecordFeePaymentInput,
} from '@sc/shared';
import { apiFetch } from './client';
import { listQuery, type ListParams } from './paging';

const FEES_KEY = ['admin', 'fees'] as const;

export type FeeFilter = 'owing' | 'overdue' | 'restricted';

export function useFeeSummary() {
  return useQuery({
    queryKey: [...FEES_KEY, 'summary'],
    queryFn: () => apiFetch<AdminFeeSummaryDto>('/v1/admin/fees/summary'),
  });
}

export function useFeeBalances(params: ListParams & { filter?: FeeFilter | undefined } = {}) {
  return useQuery({
    queryKey: [...FEES_KEY, 'list', params],
    queryFn: () => apiFetch<Paged<AdminFeeRowDto>>(`/v1/admin/fees${listQuery(params)}`),
    placeholderData: keepPreviousData,
  });
}

export function useFeeDetail(providerId: string | null) {
  return useQuery({
    queryKey: [...FEES_KEY, 'detail', providerId],
    queryFn: () => apiFetch<AdminFeeDetailDto>(`/v1/admin/fees/${providerId ?? ''}`),
    enabled: providerId !== null,
  });
}

/** A payment made outside the app (cash, bank). */
export function useRecordFeePayment(providerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RecordFeePaymentInput) =>
      apiFetch<AdminFeeDetailDto>(`/v1/admin/fees/${providerId}/payments`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: FEES_KEY });
    },
  });
}

export function useAdjustFees(providerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AdjustFeesInput) =>
      apiFetch<AdminFeeDetailDto>(`/v1/admin/fees/${providerId}/adjustments`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: FEES_KEY });
    },
  });
}

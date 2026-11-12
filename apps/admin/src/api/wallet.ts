import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdminAgentRowDto,
  AdminCashOutRowDto,
  Paged,
  RecordCashOutSettlementInput,
} from '@sc/shared';
import { apiFetch } from './client';
import { listQuery, type ListParams } from './paging';

const CASH_OUTS_KEY = ['admin', 'wallet', 'cash-outs'] as const;

export function useCashOuts(params: ListParams = {}) {
  return useQuery({
    queryKey: [...CASH_OUTS_KEY, params],
    queryFn: () =>
      apiFetch<Paged<AdminCashOutRowDto>>(`/v1/admin/wallet/cash-outs${listQuery({ ...params })}`),
    placeholderData: keepPreviousData,
  });
}

export function useAgents(params: ListParams & { subscription?: 'active' | 'lapsed' } = {}) {
  return useQuery({
    queryKey: ['admin', 'wallet', 'agents', params],
    queryFn: () => apiFetch<Paged<AdminAgentRowDto>>(`/v1/admin/wallet/agents${listQuery(params)}`),
    placeholderData: keepPreviousData,
  });
}

/** Records that a stylist's cash-out was actually paid outside the app — see CashOutSettlement's doc comment for why this never touches the coin ledger. */
export function useSettleCashOut(transactionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RecordCashOutSettlementInput) =>
      apiFetch(`/v1/admin/wallet/cash-outs/${transactionId}/settle`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CASH_OUTS_KEY });
    },
  });
}

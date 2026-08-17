import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminCashOutRowDto, RecordCashOutSettlementInput } from '@sc/shared';
import { apiFetch } from './client';

const CASH_OUTS_KEY = ['admin', 'wallet', 'cash-outs'] as const;

export function useCashOuts() {
  return useQuery({
    queryKey: CASH_OUTS_KEY,
    queryFn: () => apiFetch<AdminCashOutRowDto[]>('/v1/admin/wallet/cash-outs'),
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

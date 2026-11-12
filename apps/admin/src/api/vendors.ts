import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminVendorRowDto, Paged, ReviewVendorInput, VendorStatus } from '@sc/shared';
import { apiFetch } from './client';
import { listQuery, type ListParams } from './paging';

const VENDORS_KEY = ['admin', 'vendors'] as const;

export function useVendors(params: ListParams & { status?: VendorStatus | undefined } = {}) {
  return useQuery({
    queryKey: [...VENDORS_KEY, params],
    queryFn: () => apiFetch<Paged<AdminVendorRowDto>>(`/v1/admin/vendors${listQuery(params)}`),
    placeholderData: keepPreviousData,
  });
}

export function useReviewVendor(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ReviewVendorInput) =>
      apiFetch<AdminVendorRowDto>(`/v1/admin/vendors/${id}`, { method: 'PATCH', body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: VENDORS_KEY });
    },
  });
}

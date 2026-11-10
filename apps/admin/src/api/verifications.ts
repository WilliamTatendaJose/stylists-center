import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdminVerificationRowDto,
  Paged,
  ReviewVerificationInput,
  VerificationStatus,
} from '@sc/shared';
import { apiFetch } from './client';
import { listQuery, type ListParams } from './paging';

const VERIFICATIONS_KEY = ['admin', 'verifications'] as const;

export function useVerifications(
  params: ListParams & { status?: VerificationStatus | undefined } = {},
) {
  return useQuery({
    queryKey: [...VERIFICATIONS_KEY, params],
    queryFn: () =>
      apiFetch<Paged<AdminVerificationRowDto>>(`/v1/admin/verifications${listQuery(params)}`),
    placeholderData: keepPreviousData,
  });
}

export function useReviewVerification(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ReviewVerificationInput) =>
      apiFetch<AdminVerificationRowDto>(`/v1/admin/verifications/${id}`, {
        method: 'PATCH',
        body: input,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: VERIFICATIONS_KEY });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] });
    },
  });
}

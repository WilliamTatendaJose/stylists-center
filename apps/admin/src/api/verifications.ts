import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdminVerificationRowDto,
  ReviewVerificationInput,
  VerificationStatus,
} from '@sc/shared';
import { apiFetch } from './client';

const VERIFICATIONS_KEY = ['admin', 'verifications'] as const;

export function useVerifications(status?: VerificationStatus) {
  return useQuery({
    queryKey: [...VERIFICATIONS_KEY, status ?? 'all'],
    queryFn: () =>
      apiFetch<AdminVerificationRowDto[]>(
        `/v1/admin/verifications${status ? `?status=${status}` : ''}`,
      ),
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

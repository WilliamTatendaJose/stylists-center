import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { VerificationDto, VerificationSubmissionInput } from '@sc/shared';
import { apiFetch } from '../client.js';
import { ME_QUERY_KEY } from './useMe.js';

export const VERIFICATION_QUERY_KEY = ['verification'] as const;

export function useVerification() {
  return useQuery({
    queryKey: VERIFICATION_QUERY_KEY,
    queryFn: () => apiFetch<VerificationDto>('/v1/me/verification'),
  });
}

export function useSubmitVerification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: VerificationSubmissionInput) =>
      apiFetch<VerificationDto>('/v1/me/verification', { method: 'POST', body: input }),
    onSuccess: (verification) => {
      queryClient.setQueryData(VERIFICATION_QUERY_KEY, verification);
      void queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
    },
  });
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AcceptTermsInput, TermsDocumentStatusDto } from '@sc/shared';
import { apiFetch } from '../client.js';

export const TERMS_STATUS_KEY = ['terms', 'status'] as const;

/**
 * `GET /v1/terms/status`. Only runs while signed in. Never retried: when the
 * phone is offline the gate simply stays out of the way, and the next launch
 * or focus refetches.
 */
export function useTermsStatus(enabled: boolean) {
  return useQuery({
    queryKey: TERMS_STATUS_KEY,
    queryFn: () => apiFetch<TermsDocumentStatusDto[]>('/v1/terms/status'),
    enabled,
    retry: false,
  });
}

/**
 * `POST /v1/terms/accept`. The server answers with the refreshed status, so the
 * gate closes as soon as the last document is accepted. On failure (for example
 * a version was published while the sheet was open) the status is refetched.
 */
export function useAcceptTerms() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AcceptTermsInput) =>
      apiFetch<TermsDocumentStatusDto[]>('/v1/terms/accept', { method: 'POST', body: input }),
    onSuccess: (status) => {
      queryClient.setQueryData(TERMS_STATUS_KEY, status);
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: TERMS_STATUS_KEY });
    },
  });
}

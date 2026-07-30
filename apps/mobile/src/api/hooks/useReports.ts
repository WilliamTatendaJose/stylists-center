import { useMutation } from '@tanstack/react-query';
import type { CreateReportInput } from '@sc/shared';
import { apiFetch } from '../client.js';

/** `POST /v1/reports`. */
export function useCreateReport() {
  return useMutation({
    mutationFn: (input: CreateReportInput) =>
      apiFetch<void>('/v1/reports', { method: 'POST', body: input }),
  });
}

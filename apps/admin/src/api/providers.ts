import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminProviderRowDto, Paged, UpdateProviderAdminInput } from '@sc/shared';
import { apiFetch } from './client';
import { listQuery, type ListParams } from './paging';

const PROVIDERS_KEY = ['admin', 'providers'] as const;

export function useProviders(
  params: ListParams & {
    verified?: boolean | undefined;
  } = {},
) {
  return useQuery({
    queryKey: [...PROVIDERS_KEY, params],
    queryFn: () => apiFetch<Paged<AdminProviderRowDto>>(`/v1/admin/providers${listQuery(params)}`),
    placeholderData: keepPreviousData,
  });
}

export function useUpdateProvider(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProviderAdminInput) =>
      apiFetch<AdminProviderRowDto>(`/v1/admin/providers/${id}`, { method: 'PATCH', body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PROVIDERS_KEY });
    },
  });
}

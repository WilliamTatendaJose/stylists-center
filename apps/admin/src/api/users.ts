import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdminUserListDto,
  AdminUserRowDto,
  CreateAdminUserInput,
  UpdateAdminUserInput,
} from '@sc/shared';
import { apiFetch } from './client';

const USERS_KEY = ['admin', 'users'] as const;

export function useUsers(input: {
  query: string;
  limit: number;
  offset: number;
  includeDeleted: boolean;
}) {
  const params = new URLSearchParams({
    limit: String(input.limit),
    offset: String(input.offset),
    includeDeleted: String(input.includeDeleted),
  });
  if (input.query) params.set('q', input.query);
  return useQuery({
    queryKey: [...USERS_KEY, input],
    queryFn: () => apiFetch<AdminUserListDto>(`/v1/admin/users?${params.toString()}`),
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAdminUserInput) =>
      apiFetch<AdminUserRowDto>('/v1/admin/users', { method: 'POST', body: input }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: USERS_KEY }),
  });
}

export function useUpdateUser(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateAdminUserInput) =>
      apiFetch<AdminUserRowDto>(`/v1/admin/users/${id}`, { method: 'PATCH', body: input }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: USERS_KEY }),
  });
}

export function useDeleteUser(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ ok: true; firebaseDeleted: boolean }>(`/v1/admin/users/${id}`, {
        method: 'DELETE',
      }),
    // Firebase deletion happens after the safe database tombstone. If that
    // final external call fails, refresh so "Show deleted" exposes the retry.
    onSettled: () => void queryClient.invalidateQueries({ queryKey: USERS_KEY }),
  });
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminStaffRowDto, CreateStaffInput, UpdateStaffInput } from '@sc/shared';
import { apiFetch } from './client';

const STAFF_KEY = ['admin', 'staff'] as const;

export function useStaff(includeDeleted = false) {
  return useQuery({
    queryKey: [...STAFF_KEY, { includeDeleted }],
    queryFn: () =>
      apiFetch<AdminStaffRowDto[]>(`/v1/admin/staff?includeDeleted=${String(includeDeleted)}`),
  });
}

export function useCreateStaff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateStaffInput) =>
      apiFetch<AdminStaffRowDto>('/v1/admin/staff', { method: 'POST', body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: STAFF_KEY });
    },
  });
}

export function useUpdateStaff(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateStaffInput) =>
      apiFetch<AdminStaffRowDto>(`/v1/admin/staff/${id}`, { method: 'PATCH', body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: STAFF_KEY });
    },
  });
}

export function useDeleteStaff(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<AdminStaffRowDto>(`/v1/admin/staff/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: STAFF_KEY });
    },
  });
}

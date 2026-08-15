import { useQuery } from '@tanstack/react-query';
import type { AdminAuditLogRowDto } from '@sc/shared';
import { apiFetch } from './client';

export function useAuditLog(limit = 100) {
  return useQuery({
    queryKey: ['admin', 'audit-log', limit],
    queryFn: () => apiFetch<AdminAuditLogRowDto[]>(`/v1/admin/audit-log?limit=${String(limit)}`),
  });
}

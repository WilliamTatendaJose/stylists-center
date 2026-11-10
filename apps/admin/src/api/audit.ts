import { useQuery } from '@tanstack/react-query';
import type { AdminAuditLogRowDto } from '@sc/shared';
import { apiFetch } from './client';

/** `enabled: false` for roles that can't read the audit log (owner-only on the API). */
export function useAuditLog(limit = 100, enabled = true) {
  return useQuery({
    enabled,
    queryKey: ['admin', 'audit-log', limit],
    queryFn: () => apiFetch<AdminAuditLogRowDto[]>(`/v1/admin/audit-log?limit=${String(limit)}`),
  });
}

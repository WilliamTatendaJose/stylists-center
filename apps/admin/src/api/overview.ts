import { useQuery } from '@tanstack/react-query';
import type { AdminOverviewDto, AdminOverviewTrendPointDto } from '@sc/shared';
import { apiFetch } from './client';

export function useOverview() {
  return useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: () => apiFetch<AdminOverviewDto>('/v1/admin/overview'),
    refetchInterval: 30_000,
  });
}

export function useOverviewTrends() {
  return useQuery({
    queryKey: ['admin', 'overview', 'trends'],
    queryFn: () => apiFetch<AdminOverviewTrendPointDto[]>('/v1/admin/overview/trends'),
  });
}

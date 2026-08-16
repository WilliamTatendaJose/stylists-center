import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdminBanRowDto,
  AdminReportRowDto,
  AppealStatus,
  CreateManualBanInput,
  ReportStatus,
  ResolveAppealInput,
  UpdateReportStatusInput,
} from '@sc/shared';
import { apiFetch } from './client';

const REPORTS_KEY = ['admin', 'reports'] as const;
const BANS_KEY = ['admin', 'bans'] as const;

export function useReports(status?: ReportStatus) {
  return useQuery({
    queryKey: [...REPORTS_KEY, status ?? 'all'],
    queryFn: () =>
      apiFetch<AdminReportRowDto[]>(`/v1/admin/reports${status ? `?status=${status}` : ''}`),
  });
}

export function useReport(id: string | undefined) {
  return useQuery({
    queryKey: [...REPORTS_KEY, 'detail', id],
    queryFn: () => apiFetch<AdminReportRowDto>(`/v1/admin/reports/${id ?? ''}`),
    enabled: !!id,
  });
}

export function useUpdateReportStatus(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateReportStatusInput) =>
      apiFetch<AdminReportRowDto>(`/v1/admin/reports/${id}`, { method: 'PATCH', body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: REPORTS_KEY });
    },
  });
}

export function useBans(appealStatus?: AppealStatus) {
  return useQuery({
    queryKey: [...BANS_KEY, appealStatus ?? 'all'],
    queryFn: () =>
      apiFetch<AdminBanRowDto[]>(
        `/v1/admin/bans${appealStatus ? `?appealStatus=${appealStatus}` : ''}`,
      ),
  });
}

export function useBan(id: string | undefined) {
  return useQuery({
    queryKey: [...BANS_KEY, 'detail', id],
    queryFn: () => apiFetch<AdminBanRowDto>(`/v1/admin/bans/${id ?? ''}`),
    enabled: !!id,
  });
}

export function useCreateManualBan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateManualBanInput) =>
      apiFetch<AdminBanRowDto>('/v1/admin/bans', { method: 'POST', body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: BANS_KEY });
    },
  });
}

export function useResolveAppeal(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ResolveAppealInput) =>
      apiFetch<AdminBanRowDto>(`/v1/admin/bans/${id}`, { method: 'PATCH', body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: BANS_KEY });
    },
  });
}

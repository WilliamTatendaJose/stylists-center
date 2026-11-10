import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdminBanRowDto,
  AdminReportRowDto,
  AppealStatus,
  CreateManualBanInput,
  Paged,
  ReportStatus,
  ResolveAppealInput,
  UpdateReportStatusInput,
} from '@sc/shared';
import { apiFetch } from './client';
import { listQuery, type ListParams } from './paging';

const REPORTS_KEY = ['admin', 'reports'] as const;
const BANS_KEY = ['admin', 'bans'] as const;

export function useReports(params: ListParams & { status?: ReportStatus | undefined } = {}) {
  return useQuery({
    queryKey: [...REPORTS_KEY, params],
    queryFn: () => apiFetch<Paged<AdminReportRowDto>>(`/v1/admin/reports${listQuery(params)}`),
    placeholderData: keepPreviousData,
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

export function useBans(params: ListParams & { appealStatus?: AppealStatus | undefined } = {}) {
  return useQuery({
    queryKey: [...BANS_KEY, params],
    queryFn: () => apiFetch<Paged<AdminBanRowDto>>(`/v1/admin/bans${listQuery(params)}`),
    placeholderData: keepPreviousData,
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

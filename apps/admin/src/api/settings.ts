import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminSettingDto, ContentDocumentDto, UpdateContentDocumentInput } from '@sc/shared';
import { apiFetch } from './client';

const SETTINGS_KEY = ['admin', 'settings'] as const;
const CONTENT_KEY = ['admin', 'content'] as const;

export function useSettings() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: () => apiFetch<AdminSettingDto[]>('/v1/admin/settings'),
  });
}

/** `value: null` removes the console value, so the environment variable or default applies. */
export function useUpdateSetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: number | string | null }) =>
      apiFetch<AdminSettingDto>(`/v1/admin/settings/${key}`, { method: 'PUT', body: { value } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SETTINGS_KEY });
    },
  });
}

export function useContentDocuments() {
  return useQuery({
    queryKey: CONTENT_KEY,
    queryFn: () => apiFetch<ContentDocumentDto[]>('/v1/admin/content'),
  });
}

export function useSaveContentDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ key, ...input }: UpdateContentDocumentInput & { key: string }) =>
      apiFetch<ContentDocumentDto>(`/v1/admin/content/${key}`, { method: 'PUT', body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CONTENT_KEY });
    },
  });
}

import { useQuery } from '@tanstack/react-query';
import {
  appConfigSchema,
  defaultSettings,
  type AppConfigDto,
  type ContentDocumentDto,
  type ContentKey,
} from '@sc/shared';
import { apiFetch } from '../client.js';

/**
 * Built-in values, shown until the first `/v1/config` response arrives.
 * Parsed through the public schema, which keeps only the public settings and
 * narrows choice settings (e.g. who pays the fee) to their allowed values.
 */
const DEFAULTS: AppConfigDto = appConfigSchema.parse(defaultSettings());

/**
 * `GET /v1/config` — prices, rewards, budget range and support contacts as
 * StylistsCenter has configured them. Never blocks a screen: until it loads
 * (or if it fails) the built-in defaults are returned.
 */
export function useAppConfig(): AppConfigDto {
  const { data } = useQuery({
    queryKey: ['config'],
    queryFn: () => apiFetch<AppConfigDto>('/v1/config'),
    staleTime: 5 * 60_000,
  });
  return data ?? DEFAULTS;
}

/** `GET /v1/content/:key` — a terms or privacy document. */
export function useContentDocument(key: ContentKey) {
  return useQuery({
    queryKey: ['content', key],
    queryFn: () => apiFetch<ContentDocumentDto>(`/v1/content/${key}`),
    // Always show the latest wording when the screen opens.
    refetchOnMount: 'always',
  });
}

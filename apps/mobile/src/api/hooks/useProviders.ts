import { useQuery } from '@tanstack/react-query';
import type { ProviderListRowDto, ProviderProfileDto, ProviderSlotsResponse } from '@sc/shared';
import { apiFetch } from '../client.js';
import { useSessionStore } from '../../state/index.js';

/** The Home screen's "Available now" list. `GET /v1/providers/available`. */
export function useNearbyProviders() {
  const location = useSessionStore((s) => s.location);

  return useQuery({
    queryKey: ['providers', 'nearby', location.lat, location.lng],
    queryFn: () =>
      apiFetch<ProviderListRowDto[]>(
        `/v1/providers/available?${new URLSearchParams({
          lat: String(location.lat),
          lng: String(location.lng),
        }).toString()}`,
      ),
  });
}

/** `GET /v1/providers/:id`. */
export function useProvider(id: string | undefined) {
  const location = useSessionStore((s) => s.location);

  return useQuery({
    queryKey: ['providers', id, location.lat, location.lng],
    queryFn: () =>
      apiFetch<ProviderProfileDto>(
        `/v1/providers/${String(id)}?${new URLSearchParams({
          lat: String(location.lat),
          lng: String(location.lng),
        }).toString()}`,
      ),
    enabled: !!id,
  });
}

/** `GET /v1/providers/:id/slots?date`. */
export function useProviderSlots(id: string | undefined, date: string) {
  return useQuery({
    queryKey: ['providers', id, 'slots', date],
    queryFn: () =>
      apiFetch<ProviderSlotsResponse>(
        `/v1/providers/${String(id)}/slots?${new URLSearchParams({ date }).toString()}`,
      ),
    enabled: !!id,
  });
}

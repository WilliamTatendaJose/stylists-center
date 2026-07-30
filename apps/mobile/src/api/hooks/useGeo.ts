import { useQuery } from '@tanstack/react-query';
import type { GeoSearchResponse, RouteResponse } from '@sc/shared';
import { apiFetch } from '../client.js';
import { useSessionStore } from '../../state/index.js';

/** `GET /v1/geo/search` — PostGIS does the radius/category filtering server-side. */
export function useGeoSearch(radiusKm: number, categoryId?: string) {
  const location = useSessionStore((s) => s.location);

  return useQuery({
    queryKey: ['geo', 'search', location.lat, location.lng, radiusKm, categoryId ?? null],
    queryFn: () =>
      apiFetch<GeoSearchResponse>(
        `/v1/geo/search?${new URLSearchParams({
          lat: String(location.lat),
          lng: String(location.lng),
          radiusKm: String(radiusKm),
          ...(categoryId ? { categoryId } : {}),
        }).toString()}`,
      ),
  });
}

/** `GET /v1/geo/route?providerId`. */
export function useRoute(providerId: string | undefined) {
  const location = useSessionStore((s) => s.location);

  return useQuery({
    queryKey: ['geo', 'route', providerId, location.lat, location.lng],
    queryFn: () =>
      apiFetch<RouteResponse>(
        `/v1/geo/route?${new URLSearchParams({
          providerId: String(providerId),
          lat: String(location.lat),
          lng: String(location.lng),
        }).toString()}`,
      ),
    enabled: !!providerId,
  });
}

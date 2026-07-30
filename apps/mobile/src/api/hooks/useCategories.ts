import { useQuery } from '@tanstack/react-query';
import type { CategoryDto, RadiusKm } from '@sc/shared';
import { apiFetch } from '../client.js';
import { useSessionStore } from '../../state/index.js';

/** The radius the Home screen's category counts are computed at, when the caller doesn't need a different one (e.g. New request's live radius picker). */
const DEFAULT_RADIUS_KM: RadiusKm = 3;

/** `GET /v1/categories` — `nearbyCount` is a live PostGIS count, never a placeholder (plan §9 cutover 1, 5, 11). */
export function useCategories(radiusKm: RadiusKm = DEFAULT_RADIUS_KM) {
  const location = useSessionStore((s) => s.location);

  return useQuery({
    queryKey: ['categories', location.lat, location.lng, radiusKm],
    queryFn: () =>
      apiFetch<CategoryDto[]>(
        `/v1/categories?${new URLSearchParams({
          lat: String(location.lat),
          lng: String(location.lng),
          radiusKm: String(radiusKm),
        }).toString()}`,
      ),
  });
}

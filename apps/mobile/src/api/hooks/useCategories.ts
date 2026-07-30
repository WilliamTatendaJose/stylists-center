import { useQuery } from '@tanstack/react-query';
import type { CategoryDto } from '@sc/shared';
import { apiFetch } from '../client.js';
import { useSessionStore } from '../../state/index.js';

/** The radius the Home/New-request screens' category counts are computed at. */
const DEFAULT_RADIUS_KM = 3;

/** `GET /v1/categories` — `nearbyCount` is a live PostGIS count, never a placeholder (plan §9 cutover 1, 5, 11). */
export function useCategories() {
  const location = useSessionStore((s) => s.location);

  return useQuery({
    queryKey: ['categories', location.lat, location.lng, DEFAULT_RADIUS_KM],
    queryFn: () =>
      apiFetch<CategoryDto[]>(
        `/v1/categories?${new URLSearchParams({
          lat: String(location.lat),
          lng: String(location.lng),
          radiusKm: String(DEFAULT_RADIUS_KM),
        }).toString()}`,
      ),
  });
}

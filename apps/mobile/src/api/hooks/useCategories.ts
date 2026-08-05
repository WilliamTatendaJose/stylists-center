import { useQuery } from '@tanstack/react-query';
import { DEFAULT_BROWSE_RADIUS_KM, type CategoryDto } from '@sc/shared';
import { apiFetch } from '../client.js';
import { useSessionStore } from '../../state/index.js';

/**
 * `radiusKm` is a plain number: this hook serves both Find's free-ranging
 * browse radius AND New Request's live "N stylists in range" preview for
 * whatever starting radius the client has picked — the query param is
 * identical either way, so one hook serves both without a cast.
 */
export function useCategories(
  radiusKm: number = DEFAULT_BROWSE_RADIUS_KM,
  options?: { enabled?: boolean },
) {
  const location = useSessionStore((s) => s.location);

  return useQuery({
    enabled: options?.enabled ?? true,
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

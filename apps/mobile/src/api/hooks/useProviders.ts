import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  PROVIDER_PAGE_SIZE,
  type CreateProviderProfileInput,
  type CreateProviderProfileResponse,
  type ProviderPageDto,
  type ProviderProfileDto,
  type ProviderSlotsResponse,
} from '@sc/shared';
import { apiFetch } from '../client.js';
import { ME_QUERY_KEY } from './useMe.js';
import { useSessionStore } from '../../state/index.js';

/**
 * How often the "Available now" list re-checks who is actually available.
 * The Home screen labels this list "live", so it has to move on its own —
 * but availability is not worth a socket subscription or a tight poll on a
 * metered connection, and react-query pauses interval refetching while the
 * app is backgrounded, so this only runs while the screen is being looked at.
 */
const AVAILABILITY_POLL_MS = 60_000;

/**
 * The Home screen's "Available now" list — `GET /v1/providers/available`,
 * which now genuinely returns only providers currently taking work.
 *
 * Paginated: the previous version pulled every provider inside the radius on
 * first paint and again on every 60-second poll. `refetchInterval` on an
 * infinite query refreshes only the pages already loaded, so polling cost
 * does not grow as the user scrolls.
 */
export function useNearbyProviders() {
  const location = useSessionStore((s) => s.location);
  const maxDistanceKm = useSessionStore((s) => s.maxDistanceKm);

  return useInfiniteQuery({
    queryKey: ['providers', 'nearby', location.lat, location.lng, maxDistanceKm],
    initialPageParam: 0,
    getNextPageParam: (last: ProviderPageDto) => last.nextOffset,
    queryFn: ({ pageParam }) =>
      apiFetch<ProviderPageDto>(
        `/v1/providers/available?${new URLSearchParams({
          lat: String(location.lat),
          lng: String(location.lng),
          radiusKm: String(maxDistanceKm),
          limit: String(PROVIDER_PAGE_SIZE),
          offset: String(pageParam),
        }).toString()}`,
      ),
    refetchInterval: AVAILABILITY_POLL_MS,
  });
}

/** Shortest query worth a round trip — mirrors the API's own `q` minimum. */
const MIN_SEARCH_LENGTH = 2;

/**
 * `GET /v1/providers/search` — free-text over stylist name, category, area
 * and service names, scoped to the same max distance as the rest of the tab.
 *
 * The caller passes an already-debounced term: keying the query on the raw
 * keystroke would fire a request per character.
 */
export function useSearchProviders(debouncedQuery: string) {
  const location = useSessionStore((s) => s.location);
  const maxDistanceKm = useSessionStore((s) => s.maxDistanceKm);
  const term = debouncedQuery.trim();

  return useInfiniteQuery({
    enabled: term.length >= MIN_SEARCH_LENGTH,
    queryKey: ['providers', 'search', term, location.lat, location.lng, maxDistanceKm],
    initialPageParam: 0,
    getNextPageParam: (last: ProviderPageDto) => last.nextOffset,
    queryFn: ({ pageParam }) =>
      apiFetch<ProviderPageDto>(
        `/v1/providers/search?${new URLSearchParams({
          q: term,
          lat: String(location.lat),
          lng: String(location.lng),
          radiusKm: String(maxDistanceKm),
          limit: String(PROVIDER_PAGE_SIZE),
          offset: String(pageParam),
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

/**
 * `POST /v1/providers` — creates the signed-in user's own stylist page. The
 * role switcher previously had no way to make "you don't have a provider
 * page yet" stop being true; this is that way. Invalidates `/v1/me` so
 * `hasProviderProfile` (and every screen gated on it) picks up the change
 * immediately, without waiting for the 5-minute staleTime on that query.
 */
export function useCreateProviderProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateProviderProfileInput) =>
      apiFetch<CreateProviderProfileResponse>('/v1/providers', { method: 'POST', body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
    },
  });
}

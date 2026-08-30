import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  PROVIDER_PAGE_SIZE,
  type Me,
  type CreateProviderProfileInput,
  type CreateProviderProfileResponse,
  type CreateProviderServiceInput,
  type PaySubscriptionInput,
  type PaySubscriptionResponse,
  type ProviderManagementProfileDto,
  type ProviderPageDto,
  type ProviderProfileDto,
  type ProviderSlotsResponse,
  type ProviderSubscriptionDto,
  type SubscriptionPaymentStatusDto,
  type ServiceDto,
  type UpdateProviderProfileInput,
  type UpdateProviderServiceInput,
} from '@sc/shared';
import { apiFetch } from '../client.js';
import { confirmAfterTimeout } from '../confirmAfterTimeout.js';
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

/** `GET /v1/providers/:id/slots?date&serviceId`. */
export function useProviderSlots(
  id: string | undefined,
  serviceId: string | undefined,
  date: string,
) {
  return useQuery({
    queryKey: ['providers', id, 'slots', serviceId, date],
    queryFn: () =>
      apiFetch<ProviderSlotsResponse>(
        `/v1/providers/${String(id)}/slots?${new URLSearchParams({
          date,
          serviceId: String(serviceId),
        }).toString()}`,
      ),
    enabled: !!id && !!serviceId,
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
    mutationFn: async (input: CreateProviderProfileInput) => {
      try {
        await apiFetch<CreateProviderProfileResponse>('/v1/providers', {
          method: 'POST',
          body: input,
        });
        return { kind: 'created' as const, displayName: input.displayName };
      } catch (error) {
        const me = await confirmAfterTimeout(
          error,
          () => apiFetch<Me>('/v1/me'),
          (current) => current.hasProviderProfile && current.onboardingComplete,
        );
        return { kind: 'confirmed-after-timeout' as const, me };
      }
    },
    onSuccess: (outcome) => {
      if (outcome.kind === 'confirmed-after-timeout') {
        queryClient.setQueryData(ME_QUERY_KEY, outcome.me);
      } else {
        // A successful POST is authoritative. Seed the destination state
        // synchronously so the auth gate cannot bounce navigation back to
        // onboarding while a background /me refresh is still in flight.
        queryClient.setQueryData<Me>(ME_QUERY_KEY, (current) =>
          current
            ? {
                ...current,
                displayName: outcome.displayName,
                activeRole: 'provider',
                selectedAccountType: 'provider',
                onboardingComplete: true,
                hasProviderProfile: true,
                profileComplete: true,
              }
            : current,
        );
      }
      void queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY, refetchType: 'none' });
    },
  });
}

const PROVIDER_PROFILE_KEY = ['provider', 'profile'] as const;

export function useProviderManagementProfile() {
  return useQuery({
    queryKey: PROVIDER_PROFILE_KEY,
    queryFn: () => apiFetch<ProviderManagementProfileDto>('/v1/provider/profile'),
  });
}

export function useUpdateProviderProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProviderProfileInput) =>
      apiFetch<ProviderManagementProfileDto>('/v1/provider/profile', {
        method: 'PATCH',
        body: input,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PROVIDER_PROFILE_KEY });
      void queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ['providers'] });
    },
  });
}

export function useAddProviderService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProviderServiceInput) =>
      apiFetch<ServiceDto>('/v1/provider/services', { method: 'POST', body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PROVIDER_PROFILE_KEY });
      void queryClient.invalidateQueries({ queryKey: ['providers'] });
    },
  });
}

export function useUpdateProviderService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateProviderServiceInput }) =>
      apiFetch<ServiceDto>(`/v1/provider/services/${id}`, { method: 'PATCH', body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PROVIDER_PROFILE_KEY });
      void queryClient.invalidateQueries({ queryKey: ['providers'] });
    },
  });
}

const PROVIDER_SUBSCRIPTION_KEY = ['provider', 'subscription'] as const;

export function useProviderSubscription() {
  return useQuery({
    queryKey: PROVIDER_SUBSCRIPTION_KEY,
    queryFn: () => apiFetch<ProviderSubscriptionDto>('/v1/provider/subscription'),
  });
}

export function usePaySubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PaySubscriptionInput) =>
      apiFetch<PaySubscriptionResponse>('/v1/provider/subscription/pay', {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PROVIDER_SUBSCRIPTION_KEY });
    },
  });
}

const TERMINAL_PAYMENT_STATUSES = new Set<SubscriptionPaymentStatusDto['status']>([
  'held',
  'paid',
  'released',
  'refunded',
  'failed',
  'disputed',
]);

/**
 * Polls while an EcoCash subscription payment is in flight. The month is only
 * credited once Paynow confirms, so this is how the card learns it went
 * through — stops as soon as the status settles either way.
 */
export function useSubscriptionPaymentStatus(enabled: boolean) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ['provider', 'subscription', 'payment-status'],
    queryFn: async () => {
      const result = await apiFetch<SubscriptionPaymentStatusDto>(
        '/v1/provider/subscription/payment-status',
      );
      // The subscription card reads `paidUntil`/`active` from its own query;
      // a confirmed payment changes both.
      if (TERMINAL_PAYMENT_STATUSES.has(result.status)) {
        void queryClient.invalidateQueries({ queryKey: PROVIDER_SUBSCRIPTION_KEY });
      }
      return result;
    },
    enabled,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && TERMINAL_PAYMENT_STATUSES.has(status) ? false : 3000;
    },
  });
}

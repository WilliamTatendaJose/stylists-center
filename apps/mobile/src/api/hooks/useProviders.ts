import { useQuery } from '@tanstack/react-query';
import {
  PROVIDER_LIST,
  PROVIDER_PROFILES,
  getSlotsForProvider,
} from '../../fixtures/index.js';
import { mockDelay } from '../mockDelay.js';

/** The Home screen's "Available now" list. Swaps for `GET /v1/providers/available` in Phase 3. */
export function useNearbyProviders() {
  return useQuery({
    queryKey: ['providers', 'nearby'],
    queryFn: () => mockDelay(PROVIDER_LIST),
  });
}

/** Swaps for `GET /v1/providers/:id` in Phase 3. */
export function useProvider(id: string | undefined) {
  return useQuery({
    queryKey: ['providers', id],
    queryFn: () => mockDelay(id ? (PROVIDER_PROFILES[id] ?? null) : null),
    enabled: !!id,
  });
}

/** Swaps for `GET /v1/providers/:id/slots?date` in Phase 3. */
export function useProviderSlots(id: string | undefined, date: string) {
  return useQuery({
    queryKey: ['providers', id, 'slots', date],
    queryFn: () => mockDelay(id ? getSlotsForProvider(id, date) : null),
    enabled: !!id,
  });
}

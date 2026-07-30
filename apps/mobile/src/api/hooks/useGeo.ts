import { useQuery } from '@tanstack/react-query';
import {
  etaMinutes,
  KOMBI_FARE_USD_CENTS,
  type GeoSearchResponse,
  type RouteResponse,
  type RouteStepDto,
} from '@sc/shared';
import { PROVIDER_CATEGORY, PROVIDER_LIST, PROVIDER_LOCATIONS } from '../../fixtures/index.js';
import { mockDelay } from '../mockDelay.js';

/** Swaps for `GET /v1/geo/search` in Phase 3 — PostGIS does this filtering server-side there. */
export function useGeoSearch(radiusKm: number, categoryId?: string) {
  return useQuery({
    queryKey: ['geo', 'search', radiusKm, categoryId ?? null],
    queryFn: () => {
      const list = PROVIDER_LIST.filter((p) => {
        if (p.distanceKm > radiusKm) return false;
        if (categoryId && PROVIDER_CATEGORY[p.id] !== categoryId) return false;
        return true;
      });
      const pins = list.map((p) => ({
        id: p.id,
        displayName: p.displayName,
        initials: p.initials,
        location: PROVIDER_LOCATIONS[p.id] ?? { lat: 0, lng: 0 },
      }));
      const response: GeoSearchResponse = { pins, list };
      return mockDelay(response);
    },
  });
}

/**
 * Demo-quality step list only — plan risk R2 is explicit that a straight
 * dashed line can't produce real turn-by-turn text. Real routing (self-hosted
 * OSRM or a paid Directions API) is a later milestone; this fallback stays
 * either way.
 */
function buildSteps(distanceKm: number): RouteStepDto[] {
  return [
    { distanceLabel: `${(distanceKm * 0.4).toFixed(1)} km`, text: 'Head towards the main road.' },
    {
      distanceLabel: `${(distanceKm * 0.5).toFixed(1)} km`,
      text: 'Continue straight until you reach the junction.',
    },
    { distanceLabel: `${(distanceKm * 0.1).toFixed(1)} km`, text: 'Arrive at the destination on your right.' },
  ];
}

/** Swaps for `GET /v1/geo/route?providerId` in Phase 3. */
export function useRoute(providerId: string | undefined) {
  return useQuery({
    queryKey: ['geo', 'route', providerId],
    queryFn: () => {
      const provider = PROVIDER_LIST.find((p) => p.id === providerId);
      if (!provider) return null;
      const response: RouteResponse = {
        distanceKm: provider.distanceKm,
        etaMinutes: etaMinutes(provider.distanceKm),
        kombiFareUsdCents: KOMBI_FARE_USD_CENTS,
        steps: buildSteps(provider.distanceKm),
      };
      return mockDelay(response);
    },
    enabled: !!providerId,
  });
}

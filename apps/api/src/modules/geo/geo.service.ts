import { Injectable, NotFoundException } from '@nestjs/common';
import {
  etaMinutes,
  KOMBI_FARE_USD_CENTS,
  type GeoSearchResponse,
  type RouteResponse,
  type RouteStepDto,
} from '@sc/shared';
import { GeoRepository } from './geo.repository';
import { toProviderListRow } from './mappers';

/**
 * Demo-quality step list only — plan risk R2 is explicit that a straight
 * dashed line can't produce real turn-by-turn text. Real routing (self-hosted
 * OSRM or a paid Directions API) is a later milestone; this fallback stays
 * either way. Mirrors apps/mobile/src/api/hooks/useGeo.ts's mock version
 * exactly, so cutting a screen over changes nothing about what it renders.
 */
function buildSteps(distanceKm: number): RouteStepDto[] {
  return [
    { distanceLabel: `${(distanceKm * 0.4).toFixed(1)} km`, text: 'Head towards the main road.' },
    {
      distanceLabel: `${(distanceKm * 0.5).toFixed(1)} km`,
      text: 'Continue straight until you reach the junction.',
    },
    {
      distanceLabel: `${(distanceKm * 0.1).toFixed(1)} km`,
      text: 'Arrive at the destination on your right.',
    },
  ];
}

@Injectable()
export class GeoService {
  constructor(private readonly geo: GeoRepository) {}

  async search(
    lat: number,
    lng: number,
    radiusKm: number,
    categoryId?: string,
  ): Promise<GeoSearchResponse> {
    const rows = await this.geo.findProvidersWithinRadius(lat, lng, radiusKm, categoryId);
    return {
      pins: rows.map((r) => ({
        id: r.id,
        displayName: r.displayName,
        initials: r.initials,
        location: { lat: r.latitude, lng: r.longitude },
      })),
      list: rows.map(toProviderListRow),
    };
  }

  async route(providerId: string, lat: number, lng: number): Promise<RouteResponse> {
    const row = await this.geo.findProviderById(providerId, lat, lng);
    if (!row) throw new NotFoundException('Provider not found');

    return {
      distanceKm: row.distanceKm,
      etaMinutes: etaMinutes(row.distanceKm),
      kombiFareUsdCents: KOMBI_FARE_USD_CENTS,
      steps: buildSteps(row.distanceKm),
    };
  }
}

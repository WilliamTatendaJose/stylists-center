import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  etaMinutes,
  KOMBI_FARE_USD_CENTS,
  type GeoSearchResponse,
  type RouteResponse,
  type RouteStepDto,
} from '@sc/shared';
import type { Env } from '../../config/env';
import { GeoRepository } from './geo.repository';
import { approximateLocation } from './location-privacy';
import { toProviderListRow } from './mappers';

interface LatLng {
  lat: number;
  lng: number;
}

const OSRM_TIMEOUT_MS = 7000;

interface OsrmManeuver {
  type: string;
  modifier?: string;
}

interface OsrmStep {
  distance: number;
  name: string;
  maneuver: OsrmManeuver;
}

interface OsrmRoute {
  distance: number;
  duration: number;
  geometry: { coordinates: [number, number][] };
  legs: { steps: OsrmStep[] }[];
}

interface OsrmResponse {
  code: string;
  routes?: OsrmRoute[];
}

interface RealRoute {
  distanceKm: number;
  etaMinutes: number;
  coordinates: [number, number][];
  steps: RouteStepDto[];
}

function formatDistanceLabel(meters: number): string {
  if (meters < 950) return `${String(Math.round(meters))} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

/** Turns an OSRM maneuver (type + modifier + street name) into copy a rider can act on. */
function describeManeuver(step: OsrmStep): string {
  const street = step.name ? ` onto ${step.name}` : '';
  const { type, modifier } = step.maneuver;

  if (type === 'depart') return `Head out${street}.`;
  if (type === 'arrive') return 'Arrive at the destination.';
  if (type === 'roundabout' || type === 'rotary') {
    return `At the roundabout, take the exit${street}.`;
  }

  switch (modifier) {
    case 'straight':
      return `Continue straight${street}.`;
    case 'slight left':
      return `Bear left${street}.`;
    case 'slight right':
      return `Bear right${street}.`;
    case 'left':
      return `Turn left${street}.`;
    case 'right':
      return `Turn right${street}.`;
    case 'sharp left':
      return `Turn sharply left${street}.`;
    case 'sharp right':
      return `Turn sharply right${street}.`;
    case 'uturn':
      return `Make a U-turn${street}.`;
    default:
      return `Continue${street}.`;
  }
}

/**
 * Straight-line fallback for when the routing engine can't be reached — the
 * screen should still render a route rather than fail outright. Demo-quality
 * copy only; kept deliberately generic since there is no real street data
 * behind it.
 */
function buildFallbackSteps(distanceKm: number): RouteStepDto[] {
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
  private readonly logger = new Logger(GeoService.name);

  constructor(
    private readonly geo: GeoRepository,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async search(
    lat: number,
    lng: number,
    radiusKm: number,
    categoryId?: string,
  ): Promise<GeoSearchResponse> {
    const rows = await this.geo.findProvidersWithinRadius({
      lat,
      lng,
      radiusKm,
      categoryId,
      onlyAcceptingBookings: true,
    });
    return {
      pins: rows.map((r) => ({
        id: r.id,
        displayName: r.displayName,
        initials: r.initials,
        location: approximateLocation(r.latitude, r.longitude),
      })),
      list: rows.map(toProviderListRow),
    };
  }

  async route(providerId: string, lat: number, lng: number): Promise<RouteResponse> {
    const row = await this.geo.findProviderById(providerId, lat, lng);
    if (!row) throw new NotFoundException('Provider not found');

    const origin: LatLng = { lat, lng };
    const destination = approximateLocation(row.latitude, row.longitude);

    const real = await this.fetchOsrmRoute(origin, destination);
    if (real) {
      return {
        distanceKm: real.distanceKm,
        etaMinutes: real.etaMinutes,
        kombiFareUsdCents: KOMBI_FARE_USD_CENTS,
        steps: real.steps,
        destination,
        coordinates: real.coordinates,
      };
    }

    return {
      distanceKm: row.distanceKm,
      etaMinutes: etaMinutes(row.distanceKm),
      kombiFareUsdCents: KOMBI_FARE_USD_CENTS,
      steps: buildFallbackSteps(row.distanceKm),
      destination,
      coordinates: [
        [lng, lat],
        [destination.lng, destination.lat],
      ],
    };
  }

  /**
   * Real road-following route + turn-by-turn steps from OSRM (see
   * OSRM_BASE_URL). Returns null on any failure — unreachable host, timeout,
   * non-OK response, no route found — so the caller can degrade to the
   * straight-line fallback instead of failing the whole screen.
   */
  private async fetchOsrmRoute(origin: LatLng, destination: LatLng): Promise<RealRoute | null> {
    const base = this.config.get('OSRM_BASE_URL', { infer: true });
    const url =
      `${base}/route/v1/driving/${String(origin.lng)},${String(origin.lat)};` +
      `${String(destination.lng)},${String(destination.lat)}` +
      `?steps=true&overview=full&geometries=geojson`;

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, OSRM_TIMEOUT_MS);

    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) return null;

      const body = (await res.json()) as OsrmResponse;
      const route = body.routes?.[0];
      if (body.code !== 'Ok' || !route) return null;

      const steps = route.legs.flatMap((leg) =>
        leg.steps.map((step) => ({
          distanceLabel: formatDistanceLabel(step.distance),
          text: describeManeuver(step),
        })),
      );

      return {
        distanceKm: route.distance / 1000,
        etaMinutes: Math.max(1, Math.round(route.duration / 60)),
        coordinates: route.geometry.coordinates,
        steps: steps.length > 0 ? steps : buildFallbackSteps(route.distance / 1000),
      };
    } catch (error) {
      this.logger.warn(`OSRM routing failed, falling back to a straight line: ${String(error)}`);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}

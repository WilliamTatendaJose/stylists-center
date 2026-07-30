import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';

export interface ProviderGeoRow {
  id: string;
  displayName: string;
  tint: string;
  initials: string;
  verified: boolean;
  categoryName: string;
  areaName: string;
  ratingAvg: number;
  completedCount: number;
  priceDisplay: 'list' | 'from';
  fromPriceUsdCents: number | null;
  minServicePriceUsdCents: number | null;
  latitude: number;
  longitude: number;
  distanceKm: number;
}

/**
 * Every raw PostGIS query lives here, behind typed methods — the rest of the
 * app never writes `ST_DWithin` itself. `location` is the generated geography
 * column from the hand-written migration (plan §6); `<->` gives KNN ordering
 * off the same GIST index `ST_DWithin` uses, so a "within radius, nearest
 * first" query is a single index scan, not a filter-then-sort.
 */
@Injectable()
export class GeoRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findProvidersWithinRadius(
    lat: number,
    lng: number,
    radiusKm: number | null,
    categoryId?: string,
  ): Promise<ProviderGeoRow[]> {
    const point = Prisma.sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`;
    const radiusFilter =
      radiusKm === null
        ? Prisma.empty
        : Prisma.sql`AND ST_DWithin(p.location, ${point}, ${radiusKm * 1000})`;
    const categoryFilter = categoryId
      ? Prisma.sql`AND p."categoryId" = ${categoryId}`
      : Prisma.empty;

    return this.prisma.$queryRaw<ProviderGeoRow[]>`
      SELECT
        p.id,
        p."displayName",
        p.tint,
        p.initials,
        p.verified,
        c.name AS "categoryName",
        p."areaName",
        p."ratingAvg",
        p."completedCount",
        p."priceDisplay",
        p."fromPriceUsdCents",
        p.latitude,
        p.longitude,
        (SELECT MIN(s."priceUsdCents") FROM "Service" s WHERE s."providerId" = p.id) AS "minServicePriceUsdCents",
        ST_Distance(p.location, ${point}) / 1000 AS "distanceKm"
      FROM "ProviderProfile" p
      JOIN "Category" c ON c.id = p."categoryId"
      WHERE true ${radiusFilter} ${categoryFilter}
      ORDER BY p.location <-> ${point}
    `;
  }

  async findProviderById(id: string, lat: number, lng: number): Promise<ProviderGeoRow | null> {
    const point = Prisma.sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`;
    const rows = await this.prisma.$queryRaw<ProviderGeoRow[]>`
      SELECT
        p.id,
        p."displayName",
        p.tint,
        p.initials,
        p.verified,
        c.name AS "categoryName",
        p."areaName",
        p."ratingAvg",
        p."completedCount",
        p."priceDisplay",
        p."fromPriceUsdCents",
        p.latitude,
        p.longitude,
        (SELECT MIN(s."priceUsdCents") FROM "Service" s WHERE s."providerId" = p.id) AS "minServicePriceUsdCents",
        ST_Distance(p.location, ${point}) / 1000 AS "distanceKm"
      FROM "ProviderProfile" p
      JOIN "Category" c ON c.id = p."categoryId"
      WHERE p.id = ${id}
    `;
    return rows[0] ?? null;
  }

  /** Provider count per category within radius — Home/New-request's live "N near you" figures. */
  async countProvidersByCategory(
    lat: number,
    lng: number,
    radiusKm: number,
  ): Promise<Map<string, number>> {
    const point = Prisma.sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`;
    const rows = await this.prisma.$queryRaw<{ categoryId: string; count: bigint }[]>`
      SELECT p."categoryId", COUNT(*) AS count
      FROM "ProviderProfile" p
      WHERE ST_DWithin(p.location, ${point}, ${radiusKm * 1000})
      GROUP BY p."categoryId"
    `;
    return new Map(rows.map((r) => [r.categoryId, Number(r.count)]));
  }
}

import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';

export interface ProviderGeoRow {
  id: string;
  displayName: string;
  tint: string;
  initials: string;
  verified: boolean;
  acceptingBookings: boolean;
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

export interface FindProvidersOptions {
  lat: number;
  lng: number;
  /** null = no distance cutoff. */
  radiusKm?: number | null | undefined;
  categoryId?: string | undefined;
  searchTerm?: string | undefined;
  /** Restrict to providers currently taking work. Off by default so internal callers (match fan-out) opt in deliberately. */
  onlyAcceptingBookings?: boolean | undefined;
  /**
   * 'distance' keeps the KNN index ordering. 'relevance' blends proximity,
   * rating and verification (and text-match strength when searching) — a
   * pure distance sort put a 3.2-star unverified stylist 1 km away above a
   * 4.9-star verified one at 4 km, which is not the booking anyone wants.
   */
  sort?: 'distance' | 'relevance' | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

/** Weights for the 'relevance' sort. They sum to 1 so the score reads as a 0..1 quality. */
const W_TEXT = 0.5;
const W_PROXIMITY_SEARCH = 0.2;
const W_PROXIMITY_BROWSE = 0.45;
const W_RATING_SEARCH = 0.2;
const W_RATING_BROWSE = 0.35;
const W_VERIFIED_SEARCH = 0.1;
const W_VERIFIED_BROWSE = 0.2;

/** Distance at which the proximity term bottoms out; beyond this, further is not meaningfully worse. */
const PROXIMITY_SATURATION_KM = 10;

/** Trigram score below which a near-miss is noise rather than a match. */
const FUZZY_MATCH_THRESHOLD = 0.35;

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

  async findProvidersWithinRadius(options: FindProvidersOptions): Promise<ProviderGeoRow[]> {
    const {
      lat,
      lng,
      radiusKm = null,
      categoryId,
      searchTerm,
      onlyAcceptingBookings = false,
      sort = 'distance',
      limit,
      offset = 0,
    } = options;
    const point = Prisma.sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`;
    const radiusFilter =
      radiusKm === null
        ? Prisma.empty
        : Prisma.sql`AND ST_DWithin(p.location, ${point}, ${radiusKm * 1000})`;
    const categoryFilter = categoryId
      ? Prisma.sql`AND p."categoryId" = ${categoryId}`
      : Prisma.empty;

    const availabilityFilter = onlyAcceptingBookings
      ? Prisma.sql`AND p."acceptingBookings" = true`
      : Prisma.empty;

    const term = searchTerm?.trim();
    const hasTerm = !!term && term.length > 0;

    /**
     * How strongly the row matches the typed text: the best trigram score
     * across the four things people actually type — the stylist's name, their
     * category ("braiding"), their area ("Belgravia") and the name of a
     * service they offer ("cornrows").
     *
     * `word_similarity` rather than `similarity`: it scores the term against
     * the best-matching word inside the target, so "braider" scores highly
     * against "Hair Braiding". Plain `similarity` compares whole strings and
     * would rate that pair near zero, which is exactly the miss this fixes.
     */
    const textScore = hasTerm
      ? Prisma.sql`GREATEST(
          word_similarity(${term}, p."displayName"),
          word_similarity(${term}, c.name),
          word_similarity(${term}, p."areaName"),
          COALESCE((
            SELECT MAX(word_similarity(${term}, s3.name))
            FROM "Service" s3 WHERE s3."providerId" = p.id
          ), 0)
        )`
      : Prisma.sql`0`;

    /**
     * A row matches if it contains the term outright (ILIKE, now index-backed
     * by the gin_trgm_ops indexes) or is a close enough trigram match to
     * survive typos and word-form differences.
     */
    const searchFilter = hasTerm
      ? Prisma.sql`AND (
          p."displayName" ILIKE ${`%${term}%`}
          OR c.name ILIKE ${`%${term}%`}
          OR p."areaName" ILIKE ${`%${term}%`}
          OR EXISTS (
            SELECT 1 FROM "Service" s2
            WHERE s2."providerId" = p.id AND s2.name ILIKE ${`%${term}%`}
          )
          OR ${textScore} >= ${FUZZY_MATCH_THRESHOLD}::float8
        )`
      : Prisma.empty;

    // Every weight is cast explicitly: Prisma sends these as bound parameters
    // with no type, and Postgres infers `integer` in an arithmetic context —
    // which fails outright with `invalid input syntax for type integer: "0.2"`.
    const proximity = Prisma.sql`(1 - LEAST(ST_Distance(p.location, ${point}) / 1000.0 / ${PROXIMITY_SATURATION_KM}::float8, 1))`;
    const rating = Prisma.sql`(p."ratingAvg" / 5.0)`;
    const verifiedScore = Prisma.sql`(CASE WHEN p.verified THEN 1 ELSE 0 END)`;

    const relevance = hasTerm
      ? Prisma.sql`(${W_TEXT}::float8 * ${textScore} + ${W_PROXIMITY_SEARCH}::float8 * ${proximity} + ${W_RATING_SEARCH}::float8 * ${rating} + ${W_VERIFIED_SEARCH}::float8 * ${verifiedScore})`
      : Prisma.sql`(${W_PROXIMITY_BROWSE}::float8 * ${proximity} + ${W_RATING_BROWSE}::float8 * ${rating} + ${W_VERIFIED_BROWSE}::float8 * ${verifiedScore})`;

    // Distance is always the tiebreak, so ordering is deterministic — without
    // it, equal scores could come back in a different order per page and
    // pagination would duplicate or skip rows.
    const orderBy =
      sort === 'relevance'
        ? Prisma.sql`ORDER BY ${relevance} DESC, p.location <-> ${point}`
        : Prisma.sql`ORDER BY p.location <-> ${point}`;

    const pagination =
      limit === undefined ? Prisma.empty : Prisma.sql`LIMIT ${limit} OFFSET ${offset}`;

    return this.prisma.$queryRaw<ProviderGeoRow[]>`
      SELECT
        p.id,
        p."displayName",
        p.tint,
        p.initials,
        p.verified,
        p."acceptingBookings",
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
      WHERE true ${radiusFilter} ${categoryFilter} ${availabilityFilter} ${searchFilter}
      ${orderBy}
      ${pagination}
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
        p."acceptingBookings",
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

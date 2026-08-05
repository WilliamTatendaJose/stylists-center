import type { ProviderListRowDto } from '@sc/shared';
import type { ProviderGeoRow } from './geo.repository';

/**
 * A `priceDisplay: 'list'` provider's "from $X" card price is derived (the
 * cheapest of their own services) rather than stored redundantly — a
 * `priceDisplay: 'from'` provider's own `fromPriceUsdCents` is the real,
 * separately-set number instead (SRS: final price agreed in chat).
 */
export function toProviderListRow(row: ProviderGeoRow): ProviderListRowDto {
  const fromPriceUsdCents =
    row.priceDisplay === 'from' ? (row.fromPriceUsdCents ?? 0) : (row.minServicePriceUsdCents ?? 0);

  return {
    id: row.id,
    displayName: row.displayName,
    tint: row.tint,
    initials: row.initials,
    verified: row.verified,
    acceptingBookings: row.acceptingBookings,
    categoryName: row.categoryName,
    areaName: row.areaName,
    ratingAvg: row.ratingAvg,
    completedCount: row.completedCount,
    fromPriceUsdCents,
    distanceKm: row.distanceKm,
  };
}

import type { MatchOfferDto } from '@sc/shared';
import { PROVIDER_LIST } from './providers.js';

/**
 * The smart-match searching screen's demo acceptances (handoff: "acceptances
 * at t = 2s (1), 4s (2), 7s (3) — real app: push-driven"). Sourced from the
 * same PROVIDER_LIST fixture as the rest of M1, so the quote shown here is
 * each provider's real `fromPriceUsdCents`, not an invented number.
 */
export const MOCK_OFFERS: MatchOfferDto[] = PROVIDER_LIST.slice(0, 3).map((p) => ({
  id: `offer-${p.id}`,
  providerId: p.id,
  displayName: p.displayName,
  tint: p.tint,
  initials: p.initials,
  verified: p.verified,
  ratingAvg: p.ratingAvg,
  completedCount: p.completedCount,
  quoteUsdCents: p.fromPriceUsdCents,
}));

export const MOCK_OFFER_DELAYS_MS = [2000, 4000, 7000] as const;

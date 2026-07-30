/**
 * Smart-match radius ladder (SRS §3.3, §5.3): 1 -> 3 -> 8 km, budget relaxes
 * to flexible on each retry, capped at 3 total attempts (the initial request
 * plus 2 retries). On the 3rd failed attempt the client is told to try again
 * later, not offered another retry.
 *
 * The "stylists in range" counts (4 / 9 / 16) shown in the New Request screen
 * summary are DESIGN PLACEHOLDER COPY, not a business rule — the actual count
 * always comes from a live PostGIS query (see the API's geo module). Do not
 * wire these numbers into anything that claims to be real availability; they
 * exist here only so the mock-data screens in Phase 1 can match the reference
 * pixel-for-pixel before the backend exists.
 */
export const RADIUS_LADDER_KM = [1, 3, 8] as const;
export type RadiusKm = (typeof RADIUS_LADDER_KM)[number];

export const MAX_MATCH_ATTEMPTS = 3;

export const PLACEHOLDER_IN_RANGE_COUNT: Record<RadiusKm, number> = {
  1: 4,
  3: 9,
  8: 16,
};

export function isRadiusKm(value: number): value is RadiusKm {
  return (RADIUS_LADDER_KM as readonly number[]).includes(value);
}

/**
 * The radius for the next retry attempt, or null if the ladder is exhausted
 * (the client should be told to try later, not offered a "try again").
 * `attempt` is the attempt number that just failed (1-indexed).
 */
export function nextRadiusKm(currentRadiusKm: RadiusKm, attempt: number): RadiusKm | null {
  if (attempt >= MAX_MATCH_ATTEMPTS) return null;
  const index = RADIUS_LADDER_KM.indexOf(currentRadiusKm);
  const next = RADIUS_LADDER_KM[index + 1];
  return next ?? null;
}

export function canRetry(attempt: number): boolean {
  return attempt < MAX_MATCH_ATTEMPTS;
}

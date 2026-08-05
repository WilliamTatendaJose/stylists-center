/**
 * Smart-match radius (originally SRS §3.3, §5.3 as a fixed 1 -> 3 -> 8 km
 * ladder): the client now picks any starting distance, and each failed
 * attempt widens the net geometrically from wherever they started rather
 * than stepping through three fixed rungs. Budget still relaxes to flexible
 * on each retry, still capped at 3 total attempts (the initial request plus
 * 2 retries) — on the 3rd failed attempt the client is told to try again
 * later, not offered another retry.
 *
 * Pinning every client to the same three rungs meant someone in a sparse
 * area could never start beyond 8 km even when that was clearly too tight —
 * the fixed ladder was a specific, narrower case of "how far to search",
 * which the free browse radius below already generalises correctly.
 */
export const MIN_MATCH_RADIUS_KM = 1;
export const MAX_MATCH_RADIUS_KM = 50;
export const DEFAULT_MATCH_RADIUS_KM = 5;

export const MAX_MATCH_ATTEMPTS = 3;

/** Each retry multiplies the previous radius by this, capped at MAX_MATCH_RADIUS_KM. */
export const MATCH_RADIUS_GROWTH_FACTOR = 2.5;

export function isMatchRadiusKm(value: number): boolean {
  return Number.isFinite(value) && value >= MIN_MATCH_RADIUS_KM && value <= MAX_MATCH_RADIUS_KM;
}

export function clampMatchRadiusKm(value: number): number {
  return Math.min(Math.max(value, MIN_MATCH_RADIUS_KM), MAX_MATCH_RADIUS_KM);
}

/**
 * The radius for the next retry attempt, or null if the attempt cap is
 * reached or the radius is already at its maximum reach (widening further
 * would not change the fan-out) — either way the client should be told to
 * try later, not offered another retry. `attempt` is the attempt number
 * that just failed (1-indexed).
 */
export function nextMatchRadiusKm(currentRadiusKm: number, attempt: number): number | null {
  if (attempt >= MAX_MATCH_ATTEMPTS) return null;
  const next = Math.round(
    Math.min(currentRadiusKm * MATCH_RADIUS_GROWTH_FACTOR, MAX_MATCH_RADIUS_KM),
  );
  return next > currentRadiusKm ? next : null;
}

export function canRetry(attempt: number): boolean {
  return attempt < MAX_MATCH_ATTEMPTS;
}

/**
 * How far a client is willing to browse — Find, Market, and the map, none of
 * which are the smart-match flow above and none of which have a business
 * reason to be pinned to the 1/3/8 ladder. That ladder is a specific,
 * SRS-defined retry/expiry rule for a POSTED REQUEST; "how far will I look
 * while browsing" is an ordinary user preference and was wrongly sharing the
 * same three-rung type, which is why the "within" picker on Find/Market could
 * only ever show 1, 3, or 8 km — never 10, never 50.
 *
 * Kept as a plain, validated number rather than a second fixed ladder so a
 * slider can offer every value in between, not just three more rungs.
 */
export const MIN_BROWSE_RADIUS_KM = 1;
export const MAX_BROWSE_RADIUS_KM = 50;
export const DEFAULT_BROWSE_RADIUS_KM = 10;

export function isBrowseRadiusKm(value: number): boolean {
  return Number.isFinite(value) && value >= MIN_BROWSE_RADIUS_KM && value <= MAX_BROWSE_RADIUS_KM;
}

export function clampBrowseRadiusKm(value: number): number {
  return Math.min(Math.max(value, MIN_BROWSE_RADIUS_KM), MAX_BROWSE_RADIUS_KM);
}

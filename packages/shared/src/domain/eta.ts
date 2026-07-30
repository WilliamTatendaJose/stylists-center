/**
 * Driving ETA lookup (handoff, Directions screen, §"Maps"): a deliberate
 * placeholder for real routing. The design's dashed line is "as the crow
 * flies," not fake street routing, and this table is its ETA equivalent — a
 * demo-quality lookup, not a distance/speed model. Real routing (self-hosted
 * OSRM or a paid Directions API) is a later milestone; this table stays as the
 * fallback either way, per the handoff's production notes.
 *
 * Table, ascending distance thresholds:
 *   <= 1.2 km -> 6 min
 *   <= 2.0 km -> 9 min
 *   <= 2.4 km -> 11 min
 *   <= 3.1 km -> 14 min
 *   otherwise -> 18 min
 */
const ETA_THRESHOLDS: readonly (readonly [maxKm: number, minutes: number])[] = [
  [1.2, 6],
  [2.0, 9],
  [2.4, 11],
  [3.1, 14],
];
const ETA_FALLBACK_MINUTES = 18;

export function etaMinutes(distanceKm: number): number {
  for (const [maxKm, minutes] of ETA_THRESHOLDS) {
    if (distanceKm <= maxKm) return minutes;
  }
  return ETA_FALLBACK_MINUTES;
}

/** Flat kombi (shared taxi) fare shown alongside distance/driving on the Directions screen. */
export const KOMBI_FARE_USD_CENTS = 200;

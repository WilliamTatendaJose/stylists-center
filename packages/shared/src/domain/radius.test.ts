import { describe, expect, it } from 'vitest';
import {
  nextRadiusKm,
  canRetry,
  isRadiusKm,
  MAX_MATCH_ATTEMPTS,
  RADIUS_LADDER_KM,
  PLACEHOLDER_IN_RANGE_COUNT,
} from './radius.js';

describe('radius ladder', () => {
  it('climbs 1 -> 3 -> 8 across the two permitted retries', () => {
    expect(nextRadiusKm(1, 1)).toBe(3);
    expect(nextRadiusKm(3, 2)).toBe(8);
  });

  it('returns null once the ladder is exhausted, rather than looping', () => {
    expect(nextRadiusKm(8, 2)).toBeNull();
  });

  it('refuses a 4th attempt regardless of the current radius', () => {
    // attempt here is "the attempt that just failed" — 3 failed already means
    // no further retry, matching the SRS's "3rd failed attempt -> try later".
    expect(nextRadiusKm(1, MAX_MATCH_ATTEMPTS)).toBeNull();
    expect(canRetry(MAX_MATCH_ATTEMPTS)).toBe(false);
  });

  it('allows a retry while under the attempt cap', () => {
    expect(canRetry(1)).toBe(true);
    expect(canRetry(2)).toBe(true);
  });

  it('validates radius values against the exact ladder, not just "is a number"', () => {
    expect(isRadiusKm(1)).toBe(true);
    expect(isRadiusKm(3)).toBe(true);
    expect(isRadiusKm(8)).toBe(true);
    expect(isRadiusKm(5)).toBe(false);
    expect(isRadiusKm(0)).toBe(false);
  });

  it('has an in-range placeholder count for every ladder radius', () => {
    for (const km of RADIUS_LADDER_KM) {
      expect(PLACEHOLDER_IN_RANGE_COUNT[km]).toBeGreaterThan(0);
    }
  });
});

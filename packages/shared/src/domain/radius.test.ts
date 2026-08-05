import { describe, expect, it } from 'vitest';
import {
  nextMatchRadiusKm,
  canRetry,
  isMatchRadiusKm,
  clampMatchRadiusKm,
  isBrowseRadiusKm,
  clampBrowseRadiusKm,
  MAX_MATCH_ATTEMPTS,
  MAX_MATCH_RADIUS_KM,
  MIN_MATCH_RADIUS_KM,
  DEFAULT_MATCH_RADIUS_KM,
  MIN_BROWSE_RADIUS_KM,
  MAX_BROWSE_RADIUS_KM,
  DEFAULT_BROWSE_RADIUS_KM,
} from './radius.js';

describe('smart-match radius', () => {
  it('widens geometrically across the two permitted retries', () => {
    expect(nextMatchRadiusKm(5, 1)).toBe(13); // round(5 * 2.5)
    expect(nextMatchRadiusKm(13, 2)).toBe(33); // round(13 * 2.5)
  });

  it('caps growth at the maximum reach rather than overshooting', () => {
    expect(nextMatchRadiusKm(30, 1)).toBe(MAX_MATCH_RADIUS_KM);
  });

  it('returns null once already at the maximum reach, regardless of attempt', () => {
    expect(nextMatchRadiusKm(MAX_MATCH_RADIUS_KM, 1)).toBeNull();
  });

  it('refuses a 4th attempt regardless of the current radius', () => {
    // attempt here is "the attempt that just failed" — 3 failed already means
    // no further retry, matching the SRS's "3rd failed attempt -> try later".
    expect(nextMatchRadiusKm(5, MAX_MATCH_ATTEMPTS)).toBeNull();
    expect(canRetry(MAX_MATCH_ATTEMPTS)).toBe(false);
  });

  it('allows a retry while under the attempt cap', () => {
    expect(canRetry(1)).toBe(true);
    expect(canRetry(2)).toBe(true);
  });

  it('accepts any starting radius in the allowed range, not just fixed rungs', () => {
    expect(isMatchRadiusKm(1)).toBe(true);
    expect(isMatchRadiusKm(5)).toBe(true);
    expect(isMatchRadiusKm(MAX_MATCH_RADIUS_KM)).toBe(true);
    expect(isMatchRadiusKm(0)).toBe(false);
    expect(isMatchRadiusKm(MAX_MATCH_RADIUS_KM + 1)).toBe(false);
  });

  it('the default sits inside the allowed range', () => {
    expect(isMatchRadiusKm(DEFAULT_MATCH_RADIUS_KM)).toBe(true);
  });

  it('clamps rather than rejects, for a slider whose thumb cannot leave its own track', () => {
    expect(clampMatchRadiusKm(-5)).toBe(MIN_MATCH_RADIUS_KM);
    expect(clampMatchRadiusKm(999)).toBe(MAX_MATCH_RADIUS_KM);
    expect(clampMatchRadiusKm(25)).toBe(25);
  });
});

/**
 * A separate, deliberately unrelated sibling of the smart-match radius above
 * — the browse radius (Find/Market/map) has no retry semantics, so any value
 * in a sane range is valid and never escalates on its own.
 */
describe('browse radius', () => {
  it('accepts any value in the allowed range', () => {
    expect(isBrowseRadiusKm(1)).toBe(true);
    expect(isBrowseRadiusKm(10)).toBe(true);
    expect(isBrowseRadiusKm(23)).toBe(true);
    expect(isBrowseRadiusKm(50)).toBe(true);
  });

  it('refuses out-of-range and non-finite values', () => {
    expect(isBrowseRadiusKm(0)).toBe(false);
    expect(isBrowseRadiusKm(51)).toBe(false);
    expect(isBrowseRadiusKm(Number.NaN)).toBe(false);
    expect(isBrowseRadiusKm(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it('the default sits inside the allowed range', () => {
    expect(isBrowseRadiusKm(DEFAULT_BROWSE_RADIUS_KM)).toBe(true);
  });

  it('clamps rather than rejects, for a slider whose thumb cannot leave its own track', () => {
    expect(clampBrowseRadiusKm(-5)).toBe(MIN_BROWSE_RADIUS_KM);
    expect(clampBrowseRadiusKm(999)).toBe(MAX_BROWSE_RADIUS_KM);
    expect(clampBrowseRadiusKm(25)).toBe(25);
  });
});

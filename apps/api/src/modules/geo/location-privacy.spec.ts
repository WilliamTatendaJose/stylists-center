import { describe, expect, it } from 'vitest';
import { approximateLocation } from './location-privacy';

/** Tariro's seeded home coordinates. */
const EXACT = { lat: -17.793, lng: 31.0345 };

/** Metres per degree of latitude; good enough to assert an order of magnitude. */
const M_PER_DEG = 111_320;

describe('approximateLocation', () => {
  it('moves the point off the exact stored coordinate', () => {
    const approx = approximateLocation(EXACT.lat, EXACT.lng);
    expect(approx).not.toEqual(EXACT);
  });

  it('keeps the point within a few hundred metres, so the pin is still useful', () => {
    const approx = approximateLocation(EXACT.lat, EXACT.lng);
    const offsetMetres = Math.hypot(approx.lat - EXACT.lat, approx.lng - EXACT.lng) * M_PER_DEG;
    expect(offsetMetres).toBeLessThan(400);
  });

  /**
   * The property that makes this worth doing at all: a random jitter would
   * average out to the true position over repeated requests, so the same
   * input must always produce the same output.
   */
  it('is deterministic, so repeated sampling cannot recover the true point', () => {
    const first = approximateLocation(EXACT.lat, EXACT.lng);
    for (let i = 0; i < 50; i += 1) {
      expect(approximateLocation(EXACT.lat, EXACT.lng)).toEqual(first);
    }
  });

  it('collapses nearby homes onto the same grid point', () => {
    // Two houses ~50 m apart must not be distinguishable in the response.
    const a = approximateLocation(-17.793, 31.0345);
    const b = approximateLocation(-17.7934, 31.03455);
    expect(a).toEqual(b);
  });

  it('handles the southern/eastern hemisphere signs Harare actually uses', () => {
    const approx = approximateLocation(-17.8252, 31.0335);
    expect(approx.lat).toBeLessThan(0);
    expect(approx.lng).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from 'vitest';
import { etaMinutes, KOMBI_FARE_USD_CENTS } from './eta.js';

describe('ETA lookup table', () => {
  it('matches every value from the handoff exactly', () => {
    expect(etaMinutes(1.2)).toBe(6);
    expect(etaMinutes(2.0)).toBe(9);
    expect(etaMinutes(2.4)).toBe(11);
    expect(etaMinutes(3.1)).toBe(14);
  });

  it('falls back to 18 minutes beyond the table', () => {
    expect(etaMinutes(5)).toBe(18);
    expect(etaMinutes(9)).toBe(18); // the Borrowdale-to-Avondale seeded distance
  });

  it('is a step function on the boundaries, not a strict-less-than', () => {
    // A distance exactly on a threshold takes that threshold's minutes, not
    // the next tier up.
    expect(etaMinutes(1.2)).toBe(6);
    expect(etaMinutes(1.2001)).toBe(9);
  });

  it('handles the shortest seeded distance sensibly', () => {
    expect(etaMinutes(0)).toBe(6);
  });

  it('has the flat kombi fare from the handoff', () => {
    expect(KOMBI_FARE_USD_CENTS).toBe(200);
  });
});

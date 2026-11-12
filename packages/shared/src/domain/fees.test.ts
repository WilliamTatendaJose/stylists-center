import { describe, expect, it } from 'vitest';
import { clientTotalCents, feeCents, rewardCoinsForSpend } from './fees.js';

describe('fees', () => {
  it('matches the client example: $20 at 3% is a $0.60 fee and $20.60 total', () => {
    expect(feeCents(2000, 300)).toBe(60);
    expect(clientTotalCents(2000, 300)).toBe(2060);
  });

  it('rounds half a cent up, and never charges on nothing', () => {
    expect(feeCents(50, 300)).toBe(2); // 1.5c -> 2c
    expect(feeCents(49, 300)).toBe(1); // 1.47c -> 1c
    expect(feeCents(0, 300)).toBe(0);
    expect(feeCents(2000, 0)).toBe(0);
  });

  it('gives 1 coin per full $10 spent', () => {
    expect(rewardCoinsForSpend(999, 10)).toBe(0);
    expect(rewardCoinsForSpend(1000, 10)).toBe(1);
    expect(rewardCoinsForSpend(2599, 10)).toBe(2);
  });
});

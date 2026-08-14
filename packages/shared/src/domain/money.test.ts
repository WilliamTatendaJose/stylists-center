import { describe, expect, it } from 'vitest';
import {
  coinsToUsdCents,
  usdCentsToCoins,
  canCashOut,
  formatUsd,
  CASH_OUT_MIN_USD_CENTS,
  COIN_USD_CENTS,
} from './money.js';

describe('SC Coins', () => {
  it('converts coins to cents at the pegged $0.50 rate', () => {
    expect(coinsToUsdCents(14)).toBe(700); // 14 coins = $7.00, the handoff's wallet example
    expect(COIN_USD_CENTS).toBe(50);
  });

  it('converts cents to coins, rounding down so no fractional coin is ever awarded', () => {
    expect(usdCentsToCoins(149)).toBe(2); // $1.49 -> 2 coins, not 2.98
    expect(usdCentsToCoins(700)).toBe(14);
  });
});

describe('cash-out threshold', () => {
  it('is locked exactly at the $5 boundary — "exceeds $5" per the SRS', () => {
    expect(canCashOut(CASH_OUT_MIN_USD_CENTS)).toBe(false); // exactly $5.00 does not qualify
    expect(canCashOut(CASH_OUT_MIN_USD_CENTS + 1)).toBe(true); // $5.01 does
  });

  it('allows the handoff wallet example ($7.00) to cash out', () => {
    expect(canCashOut(coinsToUsdCents(14))).toBe(true);
  });
});

describe('formatUsd', () => {
  it('formats whole dollars with two decimal places', () => {
    expect(formatUsd(700)).toBe('$7.00');
  });

  it('pads a sub-10-cent remainder', () => {
    expect(formatUsd(705)).toBe('$7.05');
  });

  it('formats negative amounts (a refund) with a leading minus before the sign', () => {
    expect(formatUsd(-150)).toBe('-$1.50');
  });
});

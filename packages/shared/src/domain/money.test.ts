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
  it('converts coins to cents at the default $0.20 rate', () => {
    expect(coinsToUsdCents(14)).toBe(280); // 14 coins = $2.80
    expect(COIN_USD_CENTS).toBe(20);
  });

  it('converts cents to coins, rounding down so no fractional coin is ever awarded', () => {
    expect(usdCentsToCoins(149)).toBe(7); // $1.49 -> 7 whole coins
    expect(usdCentsToCoins(700)).toBe(35);
  });
});

describe('cash-out threshold', () => {
  it('is locked exactly at the $5 boundary — "exceeds $5" per the SRS', () => {
    expect(canCashOut(CASH_OUT_MIN_USD_CENTS)).toBe(false); // exactly $5.00 does not qualify
    expect(canCashOut(CASH_OUT_MIN_USD_CENTS + 1)).toBe(true); // $5.01 does
  });

  it('allows a balance above $5.00 to cash out', () => {
    expect(canCashOut(coinsToUsdCents(26))).toBe(true);
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

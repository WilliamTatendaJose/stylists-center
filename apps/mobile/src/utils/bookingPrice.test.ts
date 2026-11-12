import { describe, expect, it } from 'vitest';
import { clientPrice, coinsToApply, formatClientPrice } from './bookingPrice.js';

describe('formatClientPrice', () => {
  it('shows the price with the 3% fee named', () => {
    expect(formatClientPrice(2000, 300)).toBe('$20.60 (includes $0.60 service fee)');
  });

  it('shows just the price when there is no fee', () => {
    expect(formatClientPrice(2000, 0)).toBe('$20.00');
  });
});

describe('clientPrice', () => {
  it('rounds the fee to a whole cent', () => {
    expect(clientPrice(1550, 300)).toEqual({ feeUsdCents: 47, totalUsdCents: 1597 });
  });
});

describe('coinsToApply', () => {
  it('uses no coins when they would only pay part of the booking', () => {
    expect(coinsToApply(5, 2060, 10)).toBe(0);
  });

  it('uses exactly the coins that pay for the whole booking', () => {
    expect(coinsToApply(500, 2060, 10)).toBe(206);
    expect(coinsToApply(206, 2060, 10)).toBe(206);
  });

  it('is zero with no coins or no coin value', () => {
    expect(coinsToApply(0, 2060, 10)).toBe(0);
    expect(coinsToApply(5, 2060, 0)).toBe(0);
  });
});

describe('when the stylist carries the service fee', () => {
  it('shows the client the listed price with no fee added', () => {
    expect(clientPrice(2000, 300, 'stylist')).toEqual({ feeUsdCents: 0, totalUsdCents: 2000 });
    expect(formatClientPrice(2000, 300, 'stylist')).toBe('$20.00');
  });
});

import { describe, expect, it } from 'vitest';
import { canCancelOrder, canCollectOrder, hasEnoughStock, orderTotalUsdCents } from './order.js';

describe('order totals', () => {
  it('multiplies each line by its quantity', () => {
    expect(
      orderTotalUsdCents([
        { priceUsdCents: 1200, quantity: 2 },
        { priceUsdCents: 500, quantity: 3 },
      ]),
    ).toBe(3900);
  });

  it('is zero for an empty order', () => {
    expect(orderTotalUsdCents([])).toBe(0);
  });

  /**
   * Money is integer cents everywhere in this codebase precisely so a total
   * cannot drift by a rounding error — this is the assertion that keeps it
   * that way.
   */
  it('stays an exact integer', () => {
    const total = orderTotalUsdCents([{ priceUsdCents: 333, quantity: 3 }]);
    expect(total).toBe(999);
    expect(Number.isInteger(total)).toBe(true);
  });
});

describe('stock availability', () => {
  it('allows a quantity the seller actually has', () => {
    expect(hasEnoughStock(5, 5)).toBe(true);
    expect(hasEnoughStock(5, 1)).toBe(true);
  });

  it('refuses more than is in stock — overselling costs a real customer a real item', () => {
    expect(hasEnoughStock(5, 6)).toBe(false);
    expect(hasEnoughStock(0, 1)).toBe(false);
  });

  it('refuses a nonsense quantity', () => {
    expect(hasEnoughStock(5, 0)).toBe(false);
    expect(hasEnoughStock(5, -1)).toBe(false);
  });
});

describe('order lifecycle', () => {
  it('only a reserved order can be cancelled or collected', () => {
    expect(canCancelOrder('reserved')).toBe(true);
    expect(canCollectOrder('reserved')).toBe(true);
  });

  it('terminal orders are terminal', () => {
    for (const status of ['collected', 'cancelled'] as const) {
      expect(canCancelOrder(status)).toBe(false);
      expect(canCollectOrder(status)).toBe(false);
    }
  });
});

import { describe, expect, it } from 'vitest';
import {
  canCancelOrder,
  canCollectOrder,
  canVendorCancelOrder,
  completedStatusFor,
  dispatchedStatusFor,
  hasEnoughStock,
  isOrderCompleted,
  maxCoinsForOrder,
  orderAmountDueUsdCents,
  orderTotalUsdCents,
} from './order.js';

describe('delivery lifecycle', () => {
  it('maps fulfilment to the statuses it passes through', () => {
    expect(dispatchedStatusFor('collection')).toBe('ready_for_collection');
    expect(dispatchedStatusFor('delivery')).toBe('out_for_delivery');
    expect(completedStatusFor('collection')).toBe('collected');
    expect(completedStatusFor('delivery')).toBe('delivered');
  });

  it('treats collected and delivered as completed', () => {
    expect(isOrderCompleted('collected')).toBe(true);
    expect(isOrderCompleted('delivered')).toBe(true);
    expect(isOrderCompleted('out_for_delivery')).toBe(false);
    expect(isOrderCompleted('cancelled')).toBe(false);
  });

  it('lets only the vendor cancel an order already out for delivery', () => {
    expect(canCancelOrder('out_for_delivery')).toBe(false);
    expect(canVendorCancelOrder('out_for_delivery')).toBe(true);
    expect(canVendorCancelOrder('delivered')).toBe(false);
    expect(canCollectOrder('out_for_delivery')).toBe(true);
  });
});

describe('amount due', () => {
  it('adds delivery and takes off coins, never below zero', () => {
    expect(
      orderAmountDueUsdCents({
        productTotalUsdCents: 2000,
        deliveryChargeUsdCents: 300,
        coinsValueUsdCents: 100,
      }),
    ).toBe(2200);
    expect(
      orderAmountDueUsdCents({
        productTotalUsdCents: 100,
        deliveryChargeUsdCents: 0,
        coinsValueUsdCents: 500,
      }),
    ).toBe(0);
  });

  it('caps coins at what is owed', () => {
    expect(maxCoinsForOrder(2000, 300, 10)).toBe(230);
    expect(maxCoinsForOrder(2005, 0, 10)).toBe(200);
    expect(maxCoinsForOrder(2000, 0, 0)).toBe(0);
  });
});

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
  it('allows cancellation before handoff, but collection only after the seller marks ready', () => {
    expect(canCancelOrder('reserved')).toBe(true);
    expect(canCancelOrder('ready_for_collection')).toBe(true);
    expect(canCollectOrder('reserved')).toBe(false);
    expect(canCollectOrder('ready_for_collection')).toBe(true);
  });

  it('terminal orders are terminal', () => {
    for (const status of ['collected', 'delivered', 'cancelled'] as const) {
      expect(canCancelOrder(status)).toBe(false);
      expect(canCollectOrder(status)).toBe(false);
    }
  });
});

/**
 * Marketplace orders (handoff screens 15-18).
 *
 * A stylist sells physical goods — hair, wigs, nail supplies — and the buyer
 * collects from her. Sellers are the same ProviderProfiles the booking side
 * uses, so verification, ratings, location and payout all carry over.
 *
 * There is no seller-acceptance step. `stockQty` is authoritative and is
 * reserved atomically at checkout, so availability is a fact the platform
 * already knows rather than something to go and ask about — which also means
 * an order cannot sit unanswered the way a booking waits on a provider.
 */
export type OrderStatus = 'reserved' | 'collected' | 'cancelled';

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  reserved: 'Ready to collect',
  collected: 'Collected',
  cancelled: 'Cancelled',
};

/** Most a buyer can take of one item in a single order — a stock guard, not a business rule. */
export const MAX_ORDER_ITEM_QUANTITY = 10;

/** Only a reserved order still has something to call off; the others are terminal. */
export function canCancelOrder(status: OrderStatus): boolean {
  return status === 'reserved';
}

/** Collection is the buyer confirming they physically have the goods — the moment escrow is released. */
export function canCollectOrder(status: OrderStatus): boolean {
  return status === 'reserved';
}

export interface OrderLineInput {
  priceUsdCents: number;
  quantity: number;
}

/**
 * Order total from its lines.
 *
 * Computed from the same snapshotted prices the order stores rather than
 * from live product rows, so a seller editing a price later can never change
 * what a past buyer owed.
 */
export function orderTotalUsdCents(lines: readonly OrderLineInput[]): number {
  return lines.reduce((sum, line) => sum + line.priceUsdCents * line.quantity, 0);
}

/** Whether a requested quantity can be met right now. */
export function hasEnoughStock(stockQty: number, requestedQty: number): boolean {
  return requestedQty > 0 && requestedQty <= stockQty;
}

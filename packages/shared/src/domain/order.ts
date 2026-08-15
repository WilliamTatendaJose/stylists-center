/**
 * Marketplace orders (handoff screens 15-18).
 *
 * A stylist sells physical goods — hair, wigs, nail supplies — and the buyer
 * collects from her. Sellers are the same ProviderProfiles the booking side
 * uses, so verification, ratings, location and payout all carry over.
 *
 * Stock is reserved atomically at checkout. The seller then marks the packed
 * order ready for collection, and only the buyer can confirm the physical
 * handoff and release payment.
 */
export type OrderStatus = 'reserved' | 'ready_for_collection' | 'collected' | 'cancelled';

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  reserved: 'Being prepared',
  ready_for_collection: 'Ready to collect',
  collected: 'Collected',
  cancelled: 'Cancelled',
};

/** Most a buyer can take of one item in a single order — a stock guard, not a business rule. */
export const MAX_ORDER_ITEM_QUANTITY = 10;

/** A buyer can cancel until the physical handoff has happened. */
export function canCancelOrder(status: OrderStatus): boolean {
  return status === 'reserved' || status === 'ready_for_collection';
}

/** Collection is the buyer confirming they physically have the goods — the moment escrow is released. */
export function canCollectOrder(status: OrderStatus): boolean {
  return status === 'ready_for_collection';
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

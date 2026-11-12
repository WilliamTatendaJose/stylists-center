import { feeCents } from './fees.js';
/**
 * Marketplace orders (handoff screens 15-18).
 *
 * Only verified vendors sell. The buyer chooses delivery or collection and
 * pays the vendor directly when they receive the goods; the app records the
 * order and the vendor's commission, not the money.
 *
 * Stock is reserved atomically at checkout. The vendor then packs the order
 * (ready for collection, or out for delivery) and marks it handed over. The
 * buyer can confirm the handover too; whichever comes first completes it.
 */
export type OrderStatus =
  | 'reserved'
  | 'ready_for_collection'
  | 'out_for_delivery'
  | 'collected'
  | 'delivered'
  | 'cancelled';

export type FulfilmentMethod = 'collection' | 'delivery';

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  reserved: 'Being prepared',
  ready_for_collection: 'Ready to collect',
  out_for_delivery: 'Out for delivery',
  collected: 'Collected',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

/** Handed over to the buyer: the vendor owes commission and the buyer earns coins. */
export function isOrderCompleted(status: OrderStatus): boolean {
  return status === 'collected' || status === 'delivered';
}

/** The status a handed-over order ends in, which depends on how it travelled. */
export function completedStatusFor(fulfilment: FulfilmentMethod): 'collected' | 'delivered' {
  return fulfilment === 'delivery' ? 'delivered' : 'collected';
}

/** What "packed" means: ready at the shop, or on its way. */
export function dispatchedStatusFor(
  fulfilment: FulfilmentMethod,
): 'ready_for_collection' | 'out_for_delivery' {
  return fulfilment === 'delivery' ? 'out_for_delivery' : 'ready_for_collection';
}

/** Most a buyer can take of one item in a single order — a stock guard, not a business rule. */
export const MAX_ORDER_ITEM_QUANTITY = 10;

/** A buyer can cancel until the order is on its way or handed over. */
export function canCancelOrder(status: OrderStatus): boolean {
  return status === 'reserved' || status === 'ready_for_collection';
}

/** A vendor can still cancel an order that is out for delivery (nobody home, goods refused). */
export function canVendorCancelOrder(status: OrderStatus): boolean {
  return canCancelOrder(status) || status === 'out_for_delivery';
}

/** The buyer confirming they have the goods, once the vendor has packed or sent them. */
export function canCollectOrder(status: OrderStatus): boolean {
  return status === 'ready_for_collection' || status === 'out_for_delivery';
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

export interface OrderAmounts {
  /** Products only; the commission is charged on this. */
  productTotalUsdCents: number;
  deliveryChargeUsdCents: number;
  coinsValueUsdCents: number;
  /** Marketplace service fee the buyer pays on top, when they carry the commission. */
  serviceFeeUsdCents?: number;
}

/** Who carries the marketplace commission (setting marketplaceFeePaidBy). */
export type MarketplaceFeePayer = 'client' | 'vendor';

/**
 * The service fee added to the buyer's order: the commission on the product
 * total (never on delivery) when the buyer pays it, otherwise nothing.
 */
export function orderServiceFeeUsdCents(
  productTotalUsdCents: number,
  marketplaceFeeBps: number,
  paidBy: MarketplaceFeePayer = 'client',
): number {
  return paidBy === 'client' ? feeCents(productTotalUsdCents, marketplaceFeeBps) : 0;
}

/**
 * What the buyer still pays the vendor in cash: products plus delivery, less
 * the value of any coins spent. Coins are a payment to the vendor, so they
 * reduce what is due but not the product total the commission is based on.
 */
export function orderAmountDueUsdCents(amounts: OrderAmounts): number {
  return Math.max(
    0,
    amounts.productTotalUsdCents +
      amounts.deliveryChargeUsdCents +
      (amounts.serviceFeeUsdCents ?? 0) -
      amounts.coinsValueUsdCents,
  );
}

/** The most coins that can be spent on an order: never more than is owed. */
export function maxCoinsForOrder(
  productTotalUsdCents: number,
  deliveryChargeUsdCents: number,
  coinUsdCents: number,
  serviceFeeUsdCents = 0,
): number {
  if (coinUsdCents <= 0) return 0;
  return Math.floor(
    (productTotalUsdCents + deliveryChargeUsdCents + serviceFeeUsdCents) / coinUsdCents,
  );
}

/** Straight-line distance between two points, in km. */
export function distanceKmBetween(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * The per-km delivery rate a shop charges: its own rate, or the standard
 * rate (setting deliveryPerKmUsdCents) when it hasn't set one.
 */
export function effectiveDeliveryPerKmUsdCents(shopRate: number, standardRate: number): number {
  return shopRate > 0 ? shopRate : Math.max(0, standardRate);
}

/**
 * Delivery charge for a distance: the per-km rate times the distance rounded
 * up to whole km, with a minimum of 1 km (a delivery next door is still a trip).
 */
export function deliveryChargeUsdCents(distanceKm: number, perKmUsdCents: number): number {
  if (!Number.isFinite(distanceKm) || perKmUsdCents <= 0) return 0;
  return billableDeliveryKm(distanceKm) * perKmUsdCents;
}

/** Whole km charged for a delivery: rounded up, at least 1. */
export function billableDeliveryKm(distanceKm: number): number {
  return Math.max(1, Math.ceil(Math.max(0, distanceKm) - 1e-9));
}

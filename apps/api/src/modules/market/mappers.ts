import {
  canCancelOrder,
  canCollectOrder,
  canVendorCancelOrder,
  dispatchedStatusFor,
  effectiveDeliveryPerKmUsdCents,
  orderAmountDueUsdCents,
  type OrderRowDto,
  type ProductDetailDto,
  type ProductRowDto,
  type ProviderOrderDto,
} from '@sc/shared';
import type { Prisma } from '../../generated/prisma';

/** Shape of the raw catalogue query — a product joined to its seller and their distance. */
export interface ProductGeoRow {
  id: string;
  name: string;
  category: string;
  description: string;
  priceUsdCents: number;
  stockQty: number;
  imageUrls: string[];
  providerId: string;
  providerName: string;
  tint: string;
  initials: string;
  providerImageUrl?: string | null;
  verified: boolean;
  sellerRatingAvg: number;
  sellerCompletedCount: number;
  areaName: string;
  pickupHours: string;
  pickupAddress: string;
  delivers: boolean;
  deliveryChargeUsdCents: number;
  deliveryPerKmUsdCents: number;
  deliveryAreas: string[];
  distanceKm: number;
}

export function toProductRow(row: ProductGeoRow): ProductRowDto {
  return {
    id: row.id,
    name: row.name,
    category: row.category as ProductRowDto['category'],
    priceUsdCents: row.priceUsdCents,
    stockQty: row.stockQty,
    imageUrls: row.imageUrls,
    providerId: row.providerId,
    providerName: row.providerName,
    tint: row.tint,
    initials: row.initials,
    ...(row.providerImageUrl ? { providerImageUrl: row.providerImageUrl } : {}),
    verified: row.verified,
    sellerRatingAvg: row.sellerRatingAvg,
    sellerCompletedCount: row.sellerCompletedCount,
    areaName: row.areaName,
    distanceKm: row.distanceKm,
    delivers: row.delivers,
  };
}

export function toProductDetail(
  row: ProductGeoRow,
  standardDeliveryPerKmUsdCents: number,
): ProductDetailDto {
  return {
    ...toProductRow(row),
    description: row.description,
    pickupHours: row.pickupHours,
    pickupAddress: row.pickupAddress,
    deliveryChargeUsdCents: row.deliveryChargeUsdCents,
    deliveryPerKmUsdCents: effectiveDeliveryPerKmUsdCents(
      row.deliveryPerKmUsdCents,
      standardDeliveryPerKmUsdCents,
    ),
    deliveryAreas: row.deliveryAreas,
  };
}

export type OrderWithRelations = Prisma.OrderGetPayload<{
  include: { provider: true; items: true; productReviews: true };
}>;

export function toOrderRow(order: OrderWithRelations): OrderRowDto {
  const providerImageUrl = order.provider.profileImageUrl ?? order.provider.portfolioImageUrls[0];
  return {
    id: order.id,
    reference: order.reference,
    status: order.status,
    paymentMethod: order.paymentMethod,
    totalUsdCents: order.totalUsdCents,
    fulfilment: order.fulfilment,
    deliveryAddress: order.deliveryAddress,
    deliveryChargeUsdCents: order.deliveryChargeUsdCents,
    deliveryDistanceKm: order.deliveryDistanceKm,
    coinsUsed: order.coinsUsed,
    coinsValueUsdCents: order.coinsValueUsdCents,
    serviceFeeUsdCents: order.serviceFeeUsdCents,
    amountDueUsdCents: amountDue(order),
    createdAt: order.createdAt.toISOString(),
    providerId: order.providerId,
    providerName: order.provider.displayName,
    tint: order.provider.tint,
    initials: order.provider.initials,
    ...(providerImageUrl ? { providerImageUrl } : {}),
    areaName: order.provider.areaName,
    pickupAddress: order.pickupAddress ?? order.provider.areaName,
    pickupHours: order.pickupHours ?? order.provider.workingHoursLabel,
    pickupLat: order.pickupLat ?? order.provider.latitude,
    pickupLng: order.pickupLng ?? order.provider.longitude,
    pickupNote: order.pickupNote,
    // The name and price the buyer agreed to, not whatever the product says now.
    items: order.items.map((item) => ({
      productId: item.productId,
      name: item.nameSnapshot,
      priceUsdCents: item.priceUsdCents,
      quantity: item.quantity,
      reviewed: order.productReviews.some((review) => review.productId === item.productId),
    })),
    canCancel: canCancelOrder(order.status),
    canCollect: canCollectOrder(order.status),
  };
}

/** What the buyer still pays the vendor: products plus delivery, less coins. */
export function amountDue(order: {
  totalUsdCents: number;
  deliveryChargeUsdCents: number;
  coinsValueUsdCents: number;
  serviceFeeUsdCents: number;
}): number {
  return orderAmountDueUsdCents({
    productTotalUsdCents: order.totalUsdCents,
    deliveryChargeUsdCents: order.deliveryChargeUsdCents,
    coinsValueUsdCents: order.coinsValueUsdCents,
    serviceFeeUsdCents: order.serviceFeeUsdCents,
  });
}

export type VendorOrderWithRelations = Prisma.OrderGetPayload<{
  include: { items: true; buyer: { select: { displayName: true; phone: true } } };
}>;

export function toProviderOrder(order: VendorOrderWithRelations): ProviderOrderDto {
  return {
    id: order.id,
    reference: order.reference,
    buyerName: order.buyer.displayName,
    buyerPhone: order.buyer.phone,
    status: order.status,
    paymentMethod: order.paymentMethod,
    totalUsdCents: order.totalUsdCents,
    fulfilment: order.fulfilment,
    deliveryAddress: order.deliveryAddress,
    deliveryChargeUsdCents: order.deliveryChargeUsdCents,
    deliveryDistanceKm: order.deliveryDistanceKm,
    coinsUsed: order.coinsUsed,
    coinsValueUsdCents: order.coinsValueUsdCents,
    serviceFeeUsdCents: order.serviceFeeUsdCents,
    amountDueUsdCents: amountDue(order),
    createdAt: order.createdAt.toISOString(),
    pickupNote: order.pickupNote,
    items: order.items.map((item) => ({
      productId: item.productId,
      name: item.nameSnapshot,
      priceUsdCents: item.priceUsdCents,
      quantity: item.quantity,
    })),
    canMarkReady: order.status === 'reserved',
    canComplete:
      order.status === dispatchedStatusFor(order.fulfilment) || order.status === 'reserved',
    canCancel: canVendorCancelOrder(order.status),
  };
}

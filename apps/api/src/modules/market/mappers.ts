import {
  canCancelOrder,
  canCollectOrder,
  type OrderRowDto,
  type ProductDetailDto,
  type ProductRowDto,
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
  };
}

export function toProductDetail(row: ProductGeoRow): ProductDetailDto {
  return { ...toProductRow(row), description: row.description, pickupHours: row.pickupHours };
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

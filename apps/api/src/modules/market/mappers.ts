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
  description: string;
  priceUsdCents: number;
  stockQty: number;
  imageUrls: string[];
  providerId: string;
  providerName: string;
  tint: string;
  initials: string;
  verified: boolean;
  areaName: string;
  distanceKm: number;
}

export function toProductRow(row: ProductGeoRow): ProductRowDto {
  return {
    id: row.id,
    name: row.name,
    priceUsdCents: row.priceUsdCents,
    stockQty: row.stockQty,
    imageUrls: row.imageUrls,
    providerId: row.providerId,
    providerName: row.providerName,
    tint: row.tint,
    initials: row.initials,
    verified: row.verified,
    areaName: row.areaName,
    distanceKm: row.distanceKm,
  };
}

export function toProductDetail(row: ProductGeoRow): ProductDetailDto {
  return { ...toProductRow(row), description: row.description };
}

export type OrderWithRelations = Prisma.OrderGetPayload<{
  include: { provider: true; items: true };
}>;

export function toOrderRow(order: OrderWithRelations): OrderRowDto {
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
    areaName: order.provider.areaName,
    // The name and price the buyer agreed to, not whatever the product says now.
    items: order.items.map((item) => ({
      productId: item.productId,
      name: item.nameSnapshot,
      priceUsdCents: item.priceUsdCents,
      quantity: item.quantity,
    })),
    canCancel: canCancelOrder(order.status),
    canCollect: canCollectOrder(order.status),
  };
}

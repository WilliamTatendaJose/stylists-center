import { z } from 'zod';
import { paymentMethodSchema } from './bookings.js';
import { imageUrlSchema } from './uploads.js';

export const productRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  priceUsdCents: z.number().int(),
  stockQty: z.number().int(),
  imageUrls: z.array(imageUrlSchema).max(5),
  /** Seller identity travels with every row — a buyer collects from a person, so the row is meaningless without them. */
  providerId: z.uuid(),
  providerName: z.string(),
  tint: z.string(),
  initials: z.string(),
  providerImageUrl: imageUrlSchema.optional(),
  verified: z.boolean(),
  areaName: z.string(),
  distanceKm: z.number(),
});
export type ProductRowDto = z.infer<typeof productRowSchema>;

export const productDetailSchema = productRowSchema.extend({
  description: z.string(),
});
export type ProductDetailDto = z.infer<typeof productDetailSchema>;

export const productPageSchema = z.object({
  items: z.array(productRowSchema),
  nextOffset: z.number().int().nullable(),
});
export type ProductPageDto = z.infer<typeof productPageSchema>;

/** Page size for the catalogue — same reasoning as the provider lists. */
export const PRODUCT_PAGE_SIZE = 20;

export const orderItemSchema = z.object({
  productId: z.uuid(),
  name: z.string(),
  priceUsdCents: z.number().int(),
  quantity: z.number().int(),
});
export type OrderItemDto = z.infer<typeof orderItemSchema>;

export const orderStatusSchema = z.enum([
  'reserved',
  'ready_for_collection',
  'collected',
  'cancelled',
]);

export const orderRowSchema = z.object({
  id: z.uuid(),
  reference: z.string(),
  status: orderStatusSchema,
  paymentMethod: paymentMethodSchema,
  totalUsdCents: z.number().int(),
  createdAt: z.iso.datetime(),
  providerId: z.uuid(),
  providerName: z.string(),
  tint: z.string(),
  initials: z.string(),
  providerImageUrl: imageUrlSchema.optional(),
  areaName: z.string(),
  items: z.array(orderItemSchema),
  /** Server-decided, so the button a buyer sees and the rule the API enforces cannot drift. */
  canCancel: z.boolean(),
  canCollect: z.boolean(),
});
export type OrderRowDto = z.infer<typeof orderRowSchema>;

/**
 * An order is placed against ONE seller, because the buyer physically
 * collects it from one place. The client enforces the same rule in its cart.
 */
export const createOrderSchema = z.object({
  providerId: z.uuid(),
  paymentMethod: paymentMethodSchema,
  items: z
    .array(
      z.object({
        productId: z.uuid(),
        quantity: z.number().int().min(1).max(10),
      }),
    )
    .min(1)
    .max(20),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const createOrderResponseSchema = z.object({
  id: z.uuid(),
  reference: z.string(),
  totalUsdCents: z.number().int(),
  /** Present for Paynow orders; the client must open it to complete checkout. */
  checkoutUrl: z.url().optional(),
});
export type CreateOrderResponse = z.infer<typeof createOrderResponseSchema>;

/** A seller's own inventory row; distance/provider identity are implicit. */
export const providerProductSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string(),
  priceUsdCents: z.number().int(),
  stockQty: z.number().int(),
  imageUrls: z.array(imageUrlSchema).max(5),
  active: z.boolean(),
});
export type ProviderProductDto = z.infer<typeof providerProductSchema>;

export const createProviderProductSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().min(2).max(500),
  priceUsdCents: z.number().int().min(100).max(1_000_000),
  stockQty: z.number().int().min(0).max(100_000),
  imageUrls: z.array(imageUrlSchema).max(5).default([]),
});
export type CreateProviderProductInput = z.infer<typeof createProviderProductSchema>;

/** Full editable storefront item. Keeping stock here lets a correction be made deliberately. */
export const updateProviderProductSchema = createProviderProductSchema;
export type UpdateProviderProductInput = z.infer<typeof updateProviderProductSchema>;

/** A quick stock increment for deliveries received after the item was listed. */
export const restockProviderProductSchema = z.object({
  quantity: z.number().int().min(1).max(100_000),
});
export type RestockProviderProductInput = z.infer<typeof restockProviderProductSchema>;

/** An incoming order as the seller sees it. */
export const providerOrderSchema = z.object({
  id: z.uuid(),
  reference: z.string(),
  buyerName: z.string(),
  status: orderStatusSchema,
  paymentMethod: paymentMethodSchema,
  totalUsdCents: z.number().int(),
  createdAt: z.iso.datetime(),
  items: z.array(orderItemSchema),
  canMarkReady: z.boolean(),
});
export type ProviderOrderDto = z.infer<typeof providerOrderSchema>;

import { z } from 'zod';
import { paymentMethodSchema } from './bookings.js';

export const productRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  priceUsdCents: z.number().int(),
  stockQty: z.number().int(),
  imageUrls: z.array(z.string()),
  /** Seller identity travels with every row — a buyer collects from a person, so the row is meaningless without them. */
  providerId: z.uuid(),
  providerName: z.string(),
  tint: z.string(),
  initials: z.string(),
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

export const orderStatusSchema = z.enum(['reserved', 'collected', 'cancelled']);

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
});
export type CreateOrderResponse = z.infer<typeof createOrderResponseSchema>;

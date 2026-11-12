import { z } from 'zod';
import { paymentMethodSchema } from './bookings.js';
import { paymentActionSchema } from './payments.js';
import { imageUrlSchema } from './uploads.js';

export const productCategorySchema = z.enum([
  'hair',
  'wigs',
  'nails',
  'skincare',
  'tools',
  'other',
]);
export type ProductCategory = z.infer<typeof productCategorySchema>;
export const productSortSchema = z.enum(['nearest', 'price_asc', 'price_desc', 'newest']);
export type ProductSort = z.infer<typeof productSortSchema>;

export const productRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  category: productCategorySchema,
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
  sellerRatingAvg: z.number(),
  sellerCompletedCount: z.number().int(),
  areaName: z.string(),
  distanceKm: z.number(),
  /** Whether the vendor delivers, so a card can say so without opening the product. */
  delivers: z.boolean(),
});
export type ProductRowDto = z.infer<typeof productRowSchema>;

export const productDetailSchema = productRowSchema.extend({
  description: z.string(),
  pickupHours: z.string(),
  pickupAddress: z.string(),
  deliveryChargeUsdCents: z.number().int(),
  /** Delivery rate per km (the shop's own, or the standard rate). */
  deliveryPerKmUsdCents: z.number().int(),
  /** Free-text places the vendor delivers to, as they wrote them. */
  deliveryAreas: z.array(z.string()),
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
  reviewed: z.boolean().optional(),
});
export type OrderItemDto = z.infer<typeof orderItemSchema>;

export const orderStatusSchema = z.enum([
  'reserved',
  'ready_for_collection',
  'out_for_delivery',
  'collected',
  'delivered',
  'cancelled',
]);

export const fulfilmentMethodSchema = z.enum(['collection', 'delivery']);

export const orderRowSchema = z.object({
  id: z.uuid(),
  reference: z.string(),
  status: orderStatusSchema,
  /** `ecocash` only on orders paid in the app before payment moved to the vendor. */
  paymentMethod: paymentMethodSchema,
  /** Products only. */
  totalUsdCents: z.number().int(),
  fulfilment: fulfilmentMethodSchema,
  deliveryAddress: z.string().nullable(),
  deliveryChargeUsdCents: z.number().int(),
  /** Billed km for a per-km delivery; null for collection and older orders. */
  deliveryDistanceKm: z.number().nullable(),
  coinsUsed: z.number().int(),
  coinsValueUsdCents: z.number().int(),
  /** Service fee the buyer pays on top (0 when the vendor carries the commission). */
  serviceFeeUsdCents: z.number().int(),
  /** What the buyer pays the vendor on delivery or collection. */
  amountDueUsdCents: z.number().int(),
  createdAt: z.iso.datetime(),
  providerId: z.uuid(),
  providerName: z.string(),
  tint: z.string(),
  initials: z.string(),
  providerImageUrl: imageUrlSchema.optional(),
  areaName: z.string(),
  pickupAddress: z.string(),
  pickupHours: z.string(),
  pickupLat: z.number(),
  pickupLng: z.number(),
  pickupNote: z.string().nullable(),
  items: z.array(orderItemSchema),
  /** Server-decided, so the button a buyer sees and the rule the API enforces cannot drift. */
  canCancel: z.boolean(),
  canCollect: z.boolean(),
});
export type OrderRowDto = z.infer<typeof orderRowSchema>;

/**
 * An order is placed against ONE vendor, because it is delivered or
 * collected from one place. The buyer pays the vendor directly, so there is
 * no payment choice here.
 */
export const createOrderSchema = z
  .object({
    providerId: z.uuid(),
    checkoutKey: z.string().min(12).max(100),
    fulfilment: fulfilmentMethodSchema.default('collection'),
    /** Where to deliver; required (and only used) for delivery. */
    deliveryAddress: z.string().trim().min(5).max(300).optional(),
    /** The delivery point on the map; the charge is per km from the shop to here. */
    deliveryLat: z.number().min(-90).max(90).optional(),
    deliveryLng: z.number().min(-180).max(180).optional(),
    /** Coins the buyer wants to spend on this order. */
    coins: z.number().int().min(0).max(1_000_000).optional(),
    items: z
      .array(
        z.object({
          productId: z.uuid(),
          quantity: z.number().int().min(1).max(10),
        }),
      )
      .min(1)
      .max(20),
  })
  .refine((v) => v.fulfilment !== 'delivery' || Boolean(v.deliveryAddress), {
    path: ['deliveryAddress'],
    message: 'Enter where to deliver',
  });
export type CreateOrderInput = z.input<typeof createOrderSchema>;

export const createOrderResponseSchema = z.object({
  id: z.uuid(),
  reference: z.string(),
  totalUsdCents: z.number().int(),
  deliveryChargeUsdCents: z.number().int(),
  coinsValueUsdCents: z.number().int(),
  /** Service fee the buyer pays on top (0 when the vendor carries the commission). */
  serviceFeeUsdCents: z.number().int(),
  /** What the buyer pays the vendor on delivery or collection. */
  amountDueUsdCents: z.number().int(),
  /** Present when the gateway returned a hosted checkout page rather than a phone prompt. */
  checkoutUrl: z.url().optional(),
  /** Present when the gateway pushed an EcoCash prompt to the buyer's phone — show this while polling payment-status. */
  instructions: z.string().optional(),
  /** Present when the buyer must enter an InnBucks code or an O'mari OTP before the payment can settle. */
  action: paymentActionSchema.optional(),
});
export type CreateOrderResponse = z.infer<typeof createOrderResponseSchema>;

/** GET /v1/market/delivery-quote: what delivery to a point costs from one shop. */
export const deliveryQuoteQuerySchema = z.object({
  providerId: z.uuid(),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});
export const deliveryQuoteSchema = z.object({
  /** Whole km charged (rounded up, at least 1). */
  distanceKm: z.number(),
  perKmUsdCents: z.number().int(),
  chargeUsdCents: z.number().int(),
});
export type DeliveryQuoteDto = z.infer<typeof deliveryQuoteSchema>;

/** `GET /v1/market/orders/:id/payment-status` — polled while an EcoCash order payment is in flight. */
export const orderPaymentStatusSchema = z.object({
  status: z.enum(['none', 'pending', 'held', 'paid', 'released', 'refunded', 'failed', 'disputed']),
});
export type OrderPaymentStatusDto = z.infer<typeof orderPaymentStatusSchema>;

/** A seller's own inventory row; distance/provider identity are implicit. */
export const providerProductSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  category: productCategorySchema,
  description: z.string(),
  priceUsdCents: z.number().int(),
  stockQty: z.number().int(),
  version: z.number().int(),
  imageUrls: z.array(imageUrlSchema).max(5),
  active: z.boolean(),
});
export type ProviderProductDto = z.infer<typeof providerProductSchema>;

export const createProviderProductSchema = z.object({
  name: z.string().trim().min(2).max(80),
  category: productCategorySchema.optional(),
  description: z.string().trim().min(2).max(500),
  priceUsdCents: z.number().int().min(100).max(1_000_000),
  stockQty: z.number().int().min(0).max(100_000),
  imageUrls: z.array(imageUrlSchema).max(5).default([]),
});
export type CreateProviderProductInput = z.infer<typeof createProviderProductSchema>;

/** Full editable storefront item. Keeping stock here lets a correction be made deliberately. */
export const updateProviderProductSchema = createProviderProductSchema.extend({
  expectedVersion: z.number().int().min(0),
});
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
  /** So the vendor can arrange delivery: the buyer's account number. */
  buyerPhone: z.string().nullable(),
  status: orderStatusSchema,
  paymentMethod: paymentMethodSchema,
  totalUsdCents: z.number().int(),
  fulfilment: fulfilmentMethodSchema,
  deliveryAddress: z.string().nullable(),
  deliveryChargeUsdCents: z.number().int(),
  /** Billed km for a per-km delivery; null for collection and older orders. */
  deliveryDistanceKm: z.number().nullable(),
  coinsUsed: z.number().int(),
  coinsValueUsdCents: z.number().int(),
  /** Service fee the buyer pays on top (0 when the vendor carries the commission). */
  serviceFeeUsdCents: z.number().int(),
  /** What the vendor collects from the buyer. */
  amountDueUsdCents: z.number().int(),
  createdAt: z.iso.datetime(),
  pickupNote: z.string().nullable(),
  items: z.array(orderItemSchema),
  /** Server-decided, like the buyer's flags. */
  canMarkReady: z.boolean(),
  canComplete: z.boolean(),
  canCancel: z.boolean(),
});
export type ProviderOrderDto = z.infer<typeof providerOrderSchema>;

export const markOrderReadySchema = z.object({
  pickupNote: z.string().trim().max(160).optional(),
});
export type MarkOrderReadyInput = z.infer<typeof markOrderReadySchema>;

export const createProductReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  text: z.string().trim().max(500).optional(),
});
export type CreateProductReviewInput = z.infer<typeof createProductReviewSchema>;

export const productReviewSchema = z.object({
  id: z.uuid(),
  buyerName: z.string(),
  rating: z.number().int().min(1).max(5),
  text: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export const productReviewsSchema = z.object({
  averageRating: z.number(),
  count: z.number().int(),
  reviews: z.array(productReviewSchema),
});
export type ProductReviewsDto = z.infer<typeof productReviewsSchema>;

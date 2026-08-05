import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import {
  createOrderSchema,
  isBrowseRadiusKm,
  MAX_BROWSE_RADIUS_KM,
  MIN_BROWSE_RADIUS_KM,
  PRODUCT_PAGE_SIZE,
} from '@sc/shared';

const latLng = {
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
};

const pagination = {
  limit: z.coerce.number().int().min(1).max(50).default(PRODUCT_PAGE_SIZE),
  offset: z.coerce.number().int().min(0).default(0),
};

const productsQuerySchema = z.object({
  ...latLng,
  ...pagination,
  // The Find/Market browse radius (see categories/dto.ts) — any distance in
  // the allowed range, not the smart-match ladder.
  radiusKm: z.coerce
    .number()
    .refine(isBrowseRadiusKm, {
      message: `radiusKm must be between ${String(MIN_BROWSE_RADIUS_KM)} and ${String(MAX_BROWSE_RADIUS_KM)}`,
    })
    .optional(),
  q: z.string().trim().min(2).max(60).optional(),
});
export class ProductsQueryDto extends createZodDto(productsQuerySchema) {}

const productDetailQuerySchema = z.object(latLng);
export class ProductDetailQueryDto extends createZodDto(productDetailQuerySchema) {}

export class CreateOrderDto extends createZodDto(createOrderSchema) {}

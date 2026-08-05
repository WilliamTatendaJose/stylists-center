import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

import {
  createProviderProfileSchema,
  isBrowseRadiusKm,
  MAX_BROWSE_RADIUS_KM,
  MIN_BROWSE_RADIUS_KM,
  PROVIDER_PAGE_SIZE,
} from '@sc/shared';

const latLngSchema = {
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
};

/**
 * `radiusKm` is optional so existing callers keep the uncapped behaviour, but
 * when present it is the Find/Market browse radius — any distance in the
 * allowed range, not the smart-match ladder (see categories/dto.ts).
 */
const optionalRadiusKm = z.coerce
  .number()
  .refine(isBrowseRadiusKm, {
    message: `radiusKm must be between ${String(MIN_BROWSE_RADIUS_KM)} and ${String(MAX_BROWSE_RADIUS_KM)}`,
  })
  .optional();

/**
 * Paging. `limit` is capped server-side: without a ceiling a caller can ask
 * for the entire catalogue in one request and pagination protects nothing.
 */
const paginationSchema = {
  limit: z.coerce.number().int().min(1).max(50).default(PROVIDER_PAGE_SIZE),
  offset: z.coerce.number().int().min(0).default(0),
};

const latLngQuerySchema = z.object({
  ...latLngSchema,
  radiusKm: optionalRadiusKm,
  ...paginationSchema,
});
export class LatLngQueryDto extends createZodDto(latLngQuerySchema) {}

const providerSearchQuerySchema = z.object({
  ...latLngSchema,
  radiusKm: optionalRadiusKm,
  ...paginationSchema,
  // Two characters is the shortest query worth a round trip; below that every
  // provider matches and the result is noise.
  q: z.string().trim().min(2).max(60),
});
export class ProviderSearchQueryDto extends createZodDto(providerSearchQuerySchema) {}

const slotsQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be yyyy-MM-dd'),
});
export class SlotsQueryDto extends createZodDto(slotsQuerySchema) {}

export class CreateProviderProfileDto extends createZodDto(createProviderProfileSchema) {}

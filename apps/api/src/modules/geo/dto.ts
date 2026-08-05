import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { isBrowseRadiusKm, MAX_BROWSE_RADIUS_KM, MIN_BROWSE_RADIUS_KM } from '@sc/shared';

// The map's browse radius, not the smart-match ladder — see categories/dto.ts.
const radiusKmSchema = z.coerce.number().refine(isBrowseRadiusKm, {
  message: `radiusKm must be between ${String(MIN_BROWSE_RADIUS_KM)} and ${String(MAX_BROWSE_RADIUS_KM)}`,
});

export const geoSearchQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusKm: radiusKmSchema,
  categoryId: z.uuid().optional(),
});
export class GeoSearchQueryDto extends createZodDto(geoSearchQuerySchema) {}

export const geoRouteQuerySchema = z.object({
  providerId: z.uuid(),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});
export class GeoRouteQueryDto extends createZodDto(geoRouteQuerySchema) {}

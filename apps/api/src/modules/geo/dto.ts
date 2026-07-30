import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { isRadiusKm } from '@sc/shared';

const radiusKmSchema = z.coerce
  .number()
  .refine(isRadiusKm, { message: 'radiusKm must be 1, 3, or 8' });

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

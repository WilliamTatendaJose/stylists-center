import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { isBrowseRadiusKm, MAX_BROWSE_RADIUS_KM, MIN_BROWSE_RADIUS_KM } from '@sc/shared';

export const categoriesQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  // Browsing, not the smart-match ladder — any distance in the allowed
  // range, not just 1/3/8. That ladder is a retry rule for a posted request;
  // "how far will I look" is an ordinary preference (a Find/Market slider).
  radiusKm: z.coerce.number().refine(isBrowseRadiusKm, {
    message: `radiusKm must be between ${String(MIN_BROWSE_RADIUS_KM)} and ${String(MAX_BROWSE_RADIUS_KM)}`,
  }),
});
export class CategoriesQueryDto extends createZodDto(categoriesQuerySchema) {}

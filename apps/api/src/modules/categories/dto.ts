import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { isRadiusKm } from '@sc/shared';

export const categoriesQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusKm: z.coerce.number().refine(isRadiusKm, { message: 'radiusKm must be 1, 3, or 8' }),
});
export class CategoriesQueryDto extends createZodDto(categoriesQuerySchema) {}

import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

const latLngQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});
export class LatLngQueryDto extends createZodDto(latLngQuerySchema) {}

const slotsQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be yyyy-MM-dd'),
});
export class SlotsQueryDto extends createZodDto(slotsQuerySchema) {}

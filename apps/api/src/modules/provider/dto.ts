import { createZodDto } from 'nestjs-zod';
import { providerAvailabilitySchema } from '@sc/shared';

export class SetAvailabilityDto extends createZodDto(providerAvailabilitySchema) {}

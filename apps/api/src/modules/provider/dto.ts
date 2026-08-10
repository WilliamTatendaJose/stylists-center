import { createZodDto } from 'nestjs-zod';
import {
  createProviderProductSchema,
  createProviderServiceSchema,
  providerAvailabilitySchema,
  updateProviderProfileSchema,
} from '@sc/shared';

export class SetAvailabilityDto extends createZodDto(providerAvailabilitySchema) {}
export class UpdateProviderProfileDto extends createZodDto(updateProviderProfileSchema) {}
export class CreateProviderServiceDto extends createZodDto(createProviderServiceSchema) {}
export class CreateProviderProductDto extends createZodDto(createProviderProductSchema) {}

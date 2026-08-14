import { createZodDto } from 'nestjs-zod';
import {
  createProviderProductSchema,
  createProviderServiceSchema,
  providerAvailabilitySchema,
  paySubscriptionSchema,
  updateProviderProfileSchema,
} from '@sc/shared';

export class SetAvailabilityDto extends createZodDto(providerAvailabilitySchema) {}
export class UpdateProviderProfileDto extends createZodDto(updateProviderProfileSchema) {}
export class CreateProviderServiceDto extends createZodDto(createProviderServiceSchema) {}
export class CreateProviderProductDto extends createZodDto(createProviderProductSchema) {}
export class PaySubscriptionDto extends createZodDto(paySubscriptionSchema) {}

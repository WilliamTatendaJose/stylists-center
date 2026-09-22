import { createZodDto } from 'nestjs-zod';
import {
  createProviderProductSchema,
  createProviderServiceSchema,
  providerAvailabilitySchema,
  paySubscriptionSchema,
  updateProviderServiceSchema,
  updateProviderProfileSchema,
  updateProviderProductSchema,
  restockProviderProductSchema,
  markOrderReadySchema,
  updateWeeklyHoursSchema,
  createProviderTimeOffSchema,
} from '@sc/shared';

export class SetAvailabilityDto extends createZodDto(providerAvailabilitySchema) {}
export class UpdateProviderProfileDto extends createZodDto(updateProviderProfileSchema) {}
export class CreateProviderServiceDto extends createZodDto(createProviderServiceSchema) {}
export class UpdateProviderServiceDto extends createZodDto(updateProviderServiceSchema) {}
export class CreateProviderProductDto extends createZodDto(createProviderProductSchema) {}
export class UpdateProviderProductDto extends createZodDto(updateProviderProductSchema) {}
export class RestockProviderProductDto extends createZodDto(restockProviderProductSchema) {}
export class MarkOrderReadyDto extends createZodDto(markOrderReadySchema) {}
export class PaySubscriptionDto extends createZodDto(paySubscriptionSchema) {}
export class UpdateWeeklyHoursDto extends createZodDto(updateWeeklyHoursSchema) {}
export class CreateProviderTimeOffDto extends createZodDto(createProviderTimeOffSchema) {}

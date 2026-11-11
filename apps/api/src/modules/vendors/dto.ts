import { createZodDto } from 'nestjs-zod';
import { applyVendorSchema, vendorFulfilmentSchema } from '@sc/shared';

export class ApplyVendorDto extends createZodDto(applyVendorSchema) {}
export class VendorFulfilmentDto extends createZodDto(vendorFulfilmentSchema) {}

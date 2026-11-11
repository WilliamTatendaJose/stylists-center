import { createZodDto } from 'nestjs-zod';
import { updateContentDocumentSchema, updateSettingSchema } from '@sc/shared';

export class UpdateSettingDto extends createZodDto(updateSettingSchema) {}
export class UpdateContentDocumentDto extends createZodDto(updateContentDocumentSchema) {}

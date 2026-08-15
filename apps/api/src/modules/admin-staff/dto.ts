import { createZodDto } from 'nestjs-zod';
import { createStaffSchema, updateStaffSchema } from '@sc/shared';

export class CreateStaffDto extends createZodDto(createStaffSchema) {}
export class UpdateStaffDto extends createZodDto(updateStaffSchema) {}

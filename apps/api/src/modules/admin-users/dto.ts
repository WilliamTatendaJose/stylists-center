import { createZodDto } from 'nestjs-zod';
import { createAdminUserSchema, updateAdminUserSchema } from '@sc/shared';

export class CreateAdminUserDto extends createZodDto(createAdminUserSchema) {}
export class UpdateAdminUserDto extends createZodDto(updateAdminUserSchema) {}

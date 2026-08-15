import { createZodDto } from 'nestjs-zod';
import { adminLoginSchema } from '@sc/shared';

export class AdminLoginDto extends createZodDto(adminLoginSchema) {}

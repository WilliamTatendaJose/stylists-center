import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  adminChangePasswordSchema,
  adminLoginSchema,
  adminMfaCodeSchema,
  adminMfaDisableSchema,
  adminMfaEnableSchema,
  adminMfaLoginSchema,
} from '@sc/shared';

export class AdminLoginDto extends createZodDto(adminLoginSchema) {}

export class AdminMfaLoginDto extends createZodDto(adminMfaLoginSchema) {}
export class AdminMfaEnableDto extends createZodDto(adminMfaEnableSchema) {}
export class AdminMfaDisableDto extends createZodDto(adminMfaDisableSchema) {}
export class AdminMfaCodeDto extends createZodDto(z.object({ code: adminMfaCodeSchema })) {}
export class AdminChangePasswordDto extends createZodDto(adminChangePasswordSchema) {}

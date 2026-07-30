import { createZodDto } from 'nestjs-zod';
import {
  requestOtpSchema,
  verifyOtpSchema,
  refreshSchema,
  setActiveRoleSchema,
} from '@sc/shared';

/**
 * Wraps @sc/shared's zod schemas as nestjs-zod DTO classes — the global
 * ZodValidationPipe (main.ts) validates any `@Body()` param typed with one of
 * these, which is what makes these the SAME schemas the mobile client
 * validates against (plan §6).
 */
export class RequestOtpDto extends createZodDto(requestOtpSchema) {}
export class VerifyOtpDto extends createZodDto(verifyOtpSchema) {}
export class RefreshDto extends createZodDto(refreshSchema) {}
export class SetActiveRoleDto extends createZodDto(setActiveRoleSchema) {}

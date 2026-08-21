import { createZodDto } from 'nestjs-zod';
import {
  firebaseExchangeSchema,
  refreshSchema,
  setActiveRoleSchema,
  updateProfileSchema,
  registerPushTokenSchema,
  verificationSubmissionSchema,
} from '@sc/shared';

/**
 * Wraps @sc/shared's zod schemas as nestjs-zod DTO classes — the global
 * ZodValidationPipe (main.ts) validates any `@Body()` param typed with one of
 * these, which is what makes these the SAME schemas the mobile client
 * validates against (plan §6).
 */
export class FirebaseExchangeDto extends createZodDto(firebaseExchangeSchema) {}
export class RefreshDto extends createZodDto(refreshSchema) {}
export class SetActiveRoleDto extends createZodDto(setActiveRoleSchema) {}
export class UpdateProfileDto extends createZodDto(updateProfileSchema) {}
export class RegisterPushTokenDto extends createZodDto(registerPushTokenSchema) {}
export class VerificationSubmissionDto extends createZodDto(verificationSubmissionSchema) {}

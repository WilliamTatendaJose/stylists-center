import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  firebaseExchangeSchema,
  refreshSchema,
  setActiveRoleSchema,
  updateProfileSchema,
  registerPushTokenSchema,
  selectAccountTypeSchema,
  verificationSubmissionSchema,
  imageUrlSchema,
  notificationPreferencesSchema,
} from '@sc/shared';
import { stripUploadSignature } from '../storage/upload-access.service';

/**
 * Wraps @sc/shared's zod schemas as nestjs-zod DTO classes — the global
 * ZodValidationPipe (main.ts) validates any `@Body()` param typed with one of
 * these, which is what makes these the SAME schemas the mobile client
 * validates against (plan §6).
 */
export class FirebaseExchangeDto extends createZodDto(firebaseExchangeSchema) {}
export class RefreshDto extends createZodDto(refreshSchema) {}
export class SetActiveRoleDto extends createZodDto(setActiveRoleSchema) {}
export class SelectAccountTypeDto extends createZodDto(selectAccountTypeSchema) {}
export class UpdateProfileDto extends createZodDto(updateProfileSchema) {}
export class RegisterPushTokenDto extends createZodDto(registerPushTokenSchema) {}
/**
 * The app pre-fills the form with the URLs `GET /me/verification` returned,
 * which are now signed links; a resubmission sends those back. The signature
 * is dropped before validation, so installed apps keep working and only the
 * plain stored `/uploads/<name>` form is ever saved.
 */
export class VerificationSubmissionDto extends createZodDto(
  verificationSubmissionSchema.extend({
    idDocumentUrl: z.preprocess(stripUploadSignature, imageUrlSchema),
    selfieImageUrl: z.preprocess(stripUploadSignature, imageUrlSchema),
  }),
) {}
export class NotificationPreferencesDto extends createZodDto(notificationPreferencesSchema) {}

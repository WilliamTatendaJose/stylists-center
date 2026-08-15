import { z } from 'zod';
import { imageUrlSchema } from './uploads.js';

export const verificationStatusSchema = z.enum(['unverified', 'pending', 'verified']);
export type VerificationStatus = z.infer<typeof verificationStatusSchema>;

export const verificationSubmissionSchema = z.object({
  idDocumentUrl: imageUrlSchema,
  selfieImageUrl: imageUrlSchema,
});
export type VerificationSubmissionInput = z.infer<typeof verificationSubmissionSchema>;

export const verificationDtoSchema = z.object({
  status: verificationStatusSchema,
  idDocumentUrl: imageUrlSchema.nullable(),
  selfieImageUrl: imageUrlSchema.nullable(),
  note: z.string().nullable(),
  submittedAt: z.iso.datetime().nullable(),
});
export type VerificationDto = z.infer<typeof verificationDtoSchema>;

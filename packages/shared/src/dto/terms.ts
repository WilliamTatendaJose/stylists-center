import { z } from 'zod';
import { contentKeySchema } from './config.js';

/** One terms or privacy document that applies to the signed-in user. */
export const termsDocumentStatusSchema = z.object({
  key: contentKeySchema,
  title: z.string(),
  /** Current version. 0 means the built-in placeholder, which never needs acceptance. */
  version: z.number().int().nonnegative(),
  accepted: z.boolean(),
});
export type TermsDocumentStatusDto = z.infer<typeof termsDocumentStatusSchema>;

/** `GET /v1/terms/status` — the documents that apply to the caller. */
export const termsStatusSchema = z.array(termsDocumentStatusSchema);

/** `POST /v1/terms/accept` — the version the user has read and agreed to. */
export const acceptTermsSchema = z.object({
  key: contentKeySchema,
  version: z.number().int().positive(),
});
export type AcceptTermsInput = z.infer<typeof acceptTermsSchema>;

import { z } from 'zod';

/**
 * Images uploaded by the API are stored as origin-relative URLs so the same
 * database works on a simulator, a phone on the LAN, and the production host.
 * Existing absolute URLs remain valid for seeded/externally-hosted images.
 */
export const imageUrlSchema = z
  .string()
  .max(2_048)
  .refine(
    (value) => {
      if (/^\/uploads\/[a-f0-9-]+\.(?:jpe?g|png|webp)$/i.test(value)) return true;
      try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:';
      } catch {
        return false;
      }
    },
    { message: 'Image URL must be an uploaded image or an HTTP(S) URL' },
  );

export const uploadedImageSchema = z.object({ url: imageUrlSchema });
export type UploadedImageDto = z.infer<typeof uploadedImageSchema>;

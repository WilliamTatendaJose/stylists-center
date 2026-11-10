import type { ImagePickerAsset } from 'expo-image-picker';
/** Long-edge cap for ordinary photos (portfolio, profile, product shots). */
export const DEFAULT_UPLOAD_MAX_EDGE = 1600;
/**
 * Long-edge cap for identity-verification documents. A reviewer has to read
 * small print on an ID card, so these keep more resolution than a gallery photo.
 */
export const DOCUMENT_UPLOAD_MAX_EDGE = 2400;
export const UPLOAD_JPEG_QUALITY = 0.8;

export interface PrepareImageOptions {
  /** Longest side in px after resizing. Images already smaller are never upscaled. */
  maxEdge?: number;
}

/**
 * Downscales a picked photo so its long edge is at most `maxEdge` and
 * re-encodes it as JPEG, before it is uploaded. Camera originals are 4000+ px
 * and several MB; the API stores exactly what it receives, so shrinking here
 * saves upload time, storage and every later download.
 *
 * The picker reports post-EXIF-rotation dimensions, and the manipulator bakes
 * the orientation into the pixels, so the result needs no orientation tag.
 *
 * If the manipulator fails (unsupported format, low memory) the original asset
 * is returned unchanged: a large upload is better than a blocked one, and the
 * API still enforces its own size limit.
 */
export function prepareImageForUpload(
  asset: ImagePickerAsset,
  // Kept so callers stay identical to main; unused in this build.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _options: PrepareImageOptions = {},
): Promise<ImagePickerAsset> {
  // 0.1.0 over-the-air update: the installed 0.1.0 binary has no
  // expo-image-manipulator, so uploads go out unresized. The 0.2.0 build
  // (main) resizes on the phone.
  return Promise.resolve(asset);
}

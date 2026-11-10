import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { UploadedImageDto } from '@sc/shared';
import {
  OBJECT_STORAGE,
  STORED_OBJECT_NAME,
  UPLOAD_URL_PREFIX,
  thumbnailName,
  type ObjectStorage,
} from '../storage/object-storage';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export interface UploadedImageFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

export function detectImageExtension(buffer: Buffer): 'jpg' | 'png' | 'webp' | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpg';
  }
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'png';
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

export const THUMBNAIL_MAX_EDGE = 480;
const THUMBNAIL_JPEG_QUALITY = 75;

/**
 * Small JPEG derivative for list rows and avatars. `rotate()` with no
 * arguments applies the EXIF orientation (sharp drops the tag on output, so
 * without it phone photos would come out sideways). Transparent PNG/WebP are
 * flattened onto white because JPEG has no alpha channel.
 */
export async function createThumbnail(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .rotate()
    .resize(THUMBNAIL_MAX_EDGE, THUMBNAIL_MAX_EDGE, { fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: THUMBNAIL_JPEG_QUALITY, mozjpeg: true })
    .toBuffer();
}

const IMAGE_CONTENT_TYPES = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' } as const;

/** Stores provider-owned photos under unguessable names after checking their real bytes. */
@Injectable()
export class ImageStorageService {
  private readonly logger = new Logger(ImageStorageService.name);

  constructor(@Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage) {}

  async save(file: UploadedImageFile | undefined): Promise<UploadedImageDto> {
    if (!file?.buffer.length) throw new BadRequestException('Choose an image to upload');
    if (file.size > MAX_IMAGE_BYTES || file.buffer.length > MAX_IMAGE_BYTES) {
      throw new BadRequestException('Image must be 5 MB or smaller');
    }

    const extension = detectImageExtension(file.buffer);
    if (!extension) {
      throw new BadRequestException('Only JPEG, PNG, and WebP images are supported');
    }

    const filename = `${randomUUID()}.${extension}`;
    await this.storage.put(filename, file.buffer, IMAGE_CONTENT_TYPES[extension]);
    await this.storeThumbnail(filename, file.buffer);
    return { url: `${UPLOAD_URL_PREFIX}${filename}` };
  }

  /**
   * Best effort: a thumbnail is an optimisation, so a decode or storage failure
   * is logged and the upload still succeeds. Readers fall back to the original.
   */
  private async storeThumbnail(filename: string, original: Buffer): Promise<void> {
    try {
      await this.storage.put(
        thumbnailName(filename),
        await createThumbnail(original),
        'image/jpeg',
      );
    } catch (error) {
      this.logger.warn(
        `Thumbnail for ${filename} was not stored: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** Permanently removes an API-owned upload after a verification decision. */
  async remove(url: string | null | undefined): Promise<void> {
    if (!url?.startsWith(UPLOAD_URL_PREFIX)) return;
    const filename = url.slice(UPLOAD_URL_PREFIX.length);
    if (!STORED_OBJECT_NAME.test(filename) || !/\.(?:jpe?g|png|webp)$/i.test(filename)) return;
    await this.storage.delete(filename);
    await this.storage.delete(thumbnailName(filename));
  }
}

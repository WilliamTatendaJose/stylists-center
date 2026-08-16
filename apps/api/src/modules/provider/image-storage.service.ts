import { BadRequestException, Injectable, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import type { UploadedImageDto } from '@sc/shared';
import type { Env } from '../../config/env';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export interface UploadedImageFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

export function uploadDirectory(config: ConfigService<Env, true>): string {
  return resolve(process.cwd(), config.get('UPLOAD_DIR', { infer: true }));
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

/** Stores provider-owned photos under unguessable names after checking their real bytes. */
@Injectable()
export class ImageStorageService implements OnModuleInit {
  private readonly directory: string;

  constructor(config: ConfigService<Env, true>) {
    this.directory = uploadDirectory(config);
  }

  async onModuleInit(): Promise<void> {
    await mkdir(this.directory, { recursive: true });
  }

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
    await writeFile(resolve(this.directory, filename), file.buffer, { flag: 'wx' });
    return { url: `/uploads/${filename}` };
  }

  /** Permanently removes an API-owned upload after a verification decision. */
  async remove(url: string | null | undefined): Promise<void> {
    if (!url?.startsWith('/uploads/')) return;
    const filename = url.slice('/uploads/'.length);
    if (!/^[a-f0-9-]{36}\.(?:jpe?g|png|webp)$/i.test(filename)) return;
    try {
      await unlink(resolve(this.directory, filename));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}

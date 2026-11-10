import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import type { ObjectStorage } from '../storage/object-storage';
import {
  createThumbnail,
  detectImageExtension,
  ImageStorageService,
  THUMBNAIL_MAX_EDGE,
} from './image-storage.service';

describe('detectImageExtension', () => {
  it('recognizes supported image signatures', () => {
    expect(detectImageExtension(Buffer.from([0xff, 0xd8, 0xff, 0x00]))).toBe('jpg');
    expect(
      detectImageExtension(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    ).toBe('png');
    expect(detectImageExtension(Buffer.from('RIFF0000WEBP', 'ascii'))).toBe('webp');
  });

  it('does not trust a filename or MIME label in place of real image bytes', () => {
    expect(detectImageExtension(Buffer.from('<script>alert(1)</script>'))).toBeNull();
    expect(detectImageExtension(Buffer.alloc(0))).toBeNull();
  });
});

function solidJpeg(width: number, height: number, orientation?: number): Promise<Buffer> {
  const image = sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 80, b: 80 } },
  });
  return (orientation ? image.withMetadata({ orientation }) : image).jpeg().toBuffer();
}

describe('createThumbnail', () => {
  it('shrinks the long edge to 480 px as a JPEG', async () => {
    const meta = await sharp(await createThumbnail(await solidJpeg(2000, 1000))).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.width).toBe(THUMBNAIL_MAX_EDGE);
    expect(meta.height).toBe(240);
  });

  it('never upscales a small image', async () => {
    const meta = await sharp(await createThumbnail(await solidJpeg(100, 50))).metadata();
    expect([meta.width, meta.height]).toEqual([100, 50]);
  });

  it('applies EXIF orientation to the pixels', async () => {
    // Orientation 6 = rotate 90deg: a stored 1000x500 image displays as 500x1000.
    const meta = await sharp(await createThumbnail(await solidJpeg(1000, 500, 6))).metadata();
    expect([meta.width, meta.height]).toEqual([240, THUMBNAIL_MAX_EDGE]);
  });
});

function storageDouble(overrides: Partial<ObjectStorage> = {}) {
  const put = vi.fn<ObjectStorage['put']>(() => Promise.resolve());
  const del = vi.fn<ObjectStorage['delete']>(() => Promise.resolve());
  const storage: ObjectStorage = {
    put,
    delete: del,
    locate: vi.fn(() => Promise.resolve(null)),
    exists: vi.fn(() => Promise.resolve(false)),
    ...overrides,
  };
  return { put, del, service: new ImageStorageService(storage) };
}

describe('ImageStorageService', () => {
  it('stores the original untouched plus a thumbnail beside it', async () => {
    const { put, service } = storageDouble();
    const buffer = await solidJpeg(1200, 900);
    const { url } = await service.save({ buffer, mimetype: 'image/jpeg', size: buffer.length });

    const name = url.replace('/uploads/', '');
    expect(name).toMatch(/\.jpg$/);
    expect(put).toHaveBeenCalledTimes(2);
    expect(put.mock.calls[0]).toEqual([name, buffer, 'image/jpeg']);
    expect(put.mock.calls[1]?.[0]).toBe(name.replace('.jpg', '.thumb.jpg'));
    expect(put.mock.calls[1]?.[2]).toBe('image/jpeg');
  });

  it('still succeeds when the thumbnail cannot be generated', async () => {
    const { put, service } = storageDouble();
    // Valid JPEG signature, undecodable body: passes detection, fails in sharp.
    const buffer = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01, 0x02]);
    const { url } = await service.save({ buffer, mimetype: 'image/jpeg', size: buffer.length });
    expect(url).toMatch(/^\/uploads\/.+\.jpg$/);
    expect(put).toHaveBeenCalledTimes(1);
  });

  it('still succeeds when storing the thumbnail fails', async () => {
    const put = vi
      .fn<ObjectStorage['put']>()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('bucket down'));
    const { service } = storageDouble({ put });
    const buffer = await solidJpeg(300, 300);
    await expect(
      service.save({ buffer, mimetype: 'image/jpeg', size: buffer.length }),
    ).resolves.toMatchObject({ url: expect.stringMatching(/^\/uploads\//) as string });
  });

  it('rejects non-images before touching storage', async () => {
    const { put, service } = storageDouble();
    const buffer = Buffer.from('not an image');
    await expect(
      service.save({ buffer, mimetype: 'image/jpeg', size: buffer.length }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(put).not.toHaveBeenCalled();
  });

  it('removes the thumbnail together with the original', async () => {
    const { del, service } = storageDouble();
    await service.remove('/uploads/3a6f010d-1d13-4a06-a747-0ae1b4be35d0.png');
    expect(del.mock.calls.map(([name]) => name)).toEqual([
      '3a6f010d-1d13-4a06-a747-0ae1b4be35d0.png',
      '3a6f010d-1d13-4a06-a747-0ae1b4be35d0.thumb.jpg',
    ]);
  });
});

import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import type { ObjectStorage } from '../storage/object-storage';
import { AttachmentStorageService } from './attachment-storage.service';

function fakeStorage() {
  const put = vi.fn(() => Promise.resolve());
  return { storage: { put } as unknown as ObjectStorage, put };
}

describe('AttachmentStorageService', () => {
  it('stores a small copy of a chat photo next to the original', async () => {
    const { storage, put } = fakeStorage();
    const photo = await sharp({
      create: { width: 1600, height: 1200, channels: 3, background: '#c0392b' },
    })
      .jpeg()
      .toBuffer();
    const [saved] = await new AttachmentStorageService(storage).saveMany([
      { buffer: photo, mimetype: 'image/jpeg', originalname: 'braids.jpg', size: photo.length },
    ]);

    expect(put).toHaveBeenCalledTimes(2);
    const original = saved?.url.replace('/uploads/', '');
    const [thumbName, thumbBytes, thumbType] = put.mock.calls[1] as unknown as [
      string,
      Buffer,
      string,
    ];
    expect(thumbName).not.toBe(original);
    expect(thumbType).toBe('image/jpeg');
    const meta = await sharp(thumbBytes).metadata();
    expect(Math.max(meta.width, meta.height)).toBeLessThanOrEqual(480);
  });

  it('stores only the file itself for a document', async () => {
    const { storage, put } = fakeStorage();
    const pdf = Buffer.from('%PDF-1.4\n%test\n');
    await new AttachmentStorageService(storage).saveMany([
      { buffer: pdf, mimetype: 'application/pdf', originalname: 'quote.pdf', size: pdf.length },
    ]);
    expect(put).toHaveBeenCalledTimes(1);
  });

  it('still saves the photo when the small copy fails', async () => {
    const put = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('disk full'));
    const photo = await sharp({
      create: { width: 50, height: 50, channels: 3, background: '#000' },
    })
      .png()
      .toBuffer();
    await expect(
      new AttachmentStorageService({ put } as unknown as ObjectStorage).saveMany([
        { buffer: photo, mimetype: 'image/png', originalname: 'a.png', size: photo.length },
      ]),
    ).resolves.toHaveLength(1);
  });
});

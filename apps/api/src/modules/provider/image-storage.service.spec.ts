import { describe, expect, it } from 'vitest';
import { detectImageExtension } from './image-storage.service';

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

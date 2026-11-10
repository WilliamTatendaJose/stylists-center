import { describe, expect, it } from 'vitest';
import { thumbnailUrl } from './thumbnailUrl.js';

const NAME = '3a6f010d-1d13-4a06-a747-0ae1b4be35d0.jpg';

describe('thumbnailUrl', () => {
  it('adds the variant to absolute and relative upload URLs', () => {
    expect(thumbnailUrl(`https://api.example.com/uploads/${NAME}`)).toBe(
      `https://api.example.com/uploads/${NAME}?variant=thumb`,
    );
    expect(thumbnailUrl(`/uploads/${NAME}`)).toBe(`/uploads/${NAME}?variant=thumb`);
  });

  it('composes with an existing query string and fragment', () => {
    expect(thumbnailUrl(`/uploads/${NAME}?v=2#x`)).toBe(`/uploads/${NAME}?v=2&variant=thumb#x`);
  });

  it('leaves other URLs and existing variants alone', () => {
    expect(thumbnailUrl('https://cdn.example.com/a.jpg')).toBe('https://cdn.example.com/a.jpg');
    expect(thumbnailUrl('file:///tmp/photo.jpg')).toBe('file:///tmp/photo.jpg');
    expect(thumbnailUrl(`/uploads/${NAME}?variant=thumb`)).toBe(`/uploads/${NAME}?variant=thumb`);
    expect(thumbnailUrl(undefined)).toBeUndefined();
  });
});

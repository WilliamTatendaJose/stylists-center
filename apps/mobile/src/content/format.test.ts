import { describe, expect, it } from 'vitest';
import { paragraphs, whatsappLink } from './format.js';

describe('whatsappLink', () => {
  it('turns a local Zimbabwean number into an international wa.me link', () => {
    expect(whatsappLink('077 123 4567')).toBe('https://wa.me/263771234567');
  });
  it('keeps an international number as digits', () => {
    expect(whatsappLink('+263 77 123 4567')).toBe('https://wa.me/263771234567');
  });
  it('refuses something that is not a number', () => {
    expect(whatsappLink('TBC')).toBeNull();
  });
});

describe('paragraphs', () => {
  it('splits on blank lines and drops empty ones', () => {
    expect(paragraphs('One\nstill one\n\n\nTwo\n   \nThree ')).toEqual([
      'One\nstill one',
      'Two',
      'Three',
    ]);
  });
});

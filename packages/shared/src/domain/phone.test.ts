import { describe, expect, it } from 'vitest';
import { normalizePhone, isValidPhone } from './phone.js';

describe('phone normalisation', () => {
  it('normalises a local Zimbabwean number to E.164', () => {
    expect(normalizePhone('0771234567')).toBe('+263771234567');
  });

  it('normalises a spaced local number', () => {
    expect(normalizePhone('077 123 4567')).toBe('+263771234567');
  });

  it('passes through an already-E.164 Zimbabwean number', () => {
    expect(normalizePhone('+263771234567')).toBe('+263771234567');
  });

  it('accepts a valid number from another country in full E.164', () => {
    expect(normalizePhone('+14155552671')).toBe('+14155552671');
  });

  it('rejects garbage input rather than throwing', () => {
    expect(normalizePhone('not a phone number')).toBeNull();
    expect(normalizePhone('123')).toBeNull();
    expect(normalizePhone('')).toBeNull();
  });

  it('isValidPhone agrees with normalizePhone', () => {
    expect(isValidPhone('0771234567')).toBe(true);
    expect(isValidPhone('123')).toBe(false);
  });
});

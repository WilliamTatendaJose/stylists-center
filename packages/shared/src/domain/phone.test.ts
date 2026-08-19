import { describe, expect, it } from 'vitest';
import { normalizePhone, isValidPhone, isValidMobileMoneyPhone } from './phone.js';

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

describe('mobile money numbers', () => {
  it('accepts every Zimbabwean mobile prefix, however it is typed', () => {
    for (const input of [
      '0771234567', // Econet
      '077 123 4567',
      '+263771234567',
      '0712345678', // NetOne
      '0732345678', // Telecel
      '0782345678',
      ' 0771234567 ',
    ]) {
      expect(isValidMobileMoneyPhone(input), input).toBe(true);
    }
  });

  /**
   * The bundled libphonenumber metadata has no number type for ZW and treats
   * both of these as valid phone numbers — but neither can receive a mobile
   * money prompt, which is the whole point of the stricter check.
   */
  it('rejects landlines and short strings that isValidPhone lets through', () => {
    expect(isValidPhone('0242700000')).toBe(true);
    expect(isValidMobileMoneyPhone('0242700000')).toBe(false);

    expect(isValidPhone('12345')).toBe(true);
    expect(isValidMobileMoneyPhone('12345')).toBe(false);
  });

  it('rejects a foreign number — Paynow only prompts Zimbabwean lines', () => {
    expect(isValidMobileMoneyPhone('+14155552671')).toBe(false);
  });

  it('rejects garbage and empty input', () => {
    expect(isValidMobileMoneyPhone('not a phone')).toBe(false);
    expect(isValidMobileMoneyPhone('')).toBe(false);
  });
});

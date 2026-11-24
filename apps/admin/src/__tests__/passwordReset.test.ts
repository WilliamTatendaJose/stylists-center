import { describe, expect, it } from 'vitest';
import { resetErrorMessage, resetLinkUrl } from '../passwordReset';

describe('password reset helpers', () => {
  it('sends the emailed link to the reset page on the same origin', () => {
    expect(resetLinkUrl('https://admin.example.com')).toBe(
      'https://admin.example.com/reset-password',
    );
  });

  it('names the Firebase setting to fix when email-link sign-in is off', () => {
    expect(resetErrorMessage({ code: 'auth/operation-not-allowed' })).toMatch(/Email link sign-in/);
  });

  it('names the authorised-domains list when the console domain is missing', () => {
    expect(resetErrorMessage({ code: 'auth/unauthorized-continue-uri' })).toMatch(
      /Authorized domains/,
    );
    expect(resetErrorMessage({ code: 'auth/unauthorized-domain' })).toMatch(/Authorized domains/);
  });

  it('explains a used or expired link', () => {
    expect(resetErrorMessage({ code: 'auth/invalid-action-code' })).toMatch(/already been used/);
  });

  it('falls back to a generic message for anything else', () => {
    expect(resetErrorMessage(new Error('boom'))).toMatch(/Something went wrong/);
    expect(resetErrorMessage(null)).toMatch(/Something went wrong/);
  });
});

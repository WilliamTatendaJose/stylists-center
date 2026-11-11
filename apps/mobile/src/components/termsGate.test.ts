import { describe, expect, it } from 'vitest';
import { isTermsGateExempt, pendingTermsDocuments } from './termsGate.js';

const doc = (key: 'privacy' | 'terms-clients', accepted: boolean) => ({
  key,
  title: key,
  version: 1,
  accepted,
});

describe('pendingTermsDocuments', () => {
  it('keeps only the documents the user has not accepted, in server order', () => {
    const docs = [doc('terms-clients', true), doc('privacy', false)];
    expect(pendingTermsDocuments(docs)).toEqual([doc('privacy', false)]);
  });

  it('is empty while the status is unknown, so an offline user is not blocked', () => {
    expect(pendingTermsDocuments(undefined)).toEqual([]);
  });
});

describe('isTermsGateExempt', () => {
  it('stays out of the way on sign-in and legal screens', () => {
    expect(isTermsGateExempt('(auth)')).toBe(true);
    expect(isTermsGateExempt('legal')).toBe(true);
  });

  it('shows on every other screen, including before any route is known', () => {
    expect(isTermsGateExempt('(tabs)')).toBe(false);
    expect(isTermsGateExempt('profile')).toBe(false);
    expect(isTermsGateExempt(undefined)).toBe(false);
  });
});

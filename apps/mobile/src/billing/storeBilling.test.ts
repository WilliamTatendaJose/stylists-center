import { describe, expect, it, vi } from 'vitest';

const platform = { OS: 'android' };
const updates = { channel: 'production' as string | null };
vi.mock('react-native', () => ({ Platform: platform }));
vi.mock('expo-updates', () => updates);
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({}) }));
vi.mock('../api/client.js', () => ({ apiFetch: () => Promise.resolve() }));
vi.mock('../api/errorMessage.js', () => ({ describeError: () => '' }));

const { storeBillingActive, storeToken } = await import('./storeBilling.js');

describe('storeBillingActive', () => {
  it('is on only in the store app, on a phone, once staff switch it on', () => {
    platform.OS = 'android';
    updates.channel = 'production';
    expect(storeBillingActive('on')).toBe(true);
    expect(storeBillingActive('off')).toBe(false);
    updates.channel = 'preview';
    expect(storeBillingActive('on')).toBe(false);
    updates.channel = 'production';
    platform.OS = 'web';
    expect(storeBillingActive('on')).toBe(false);
  });
});

describe('storeToken', () => {
  it('sends the Play purchase token on Android and the transaction id on iOS', () => {
    platform.OS = 'android';
    expect(storeToken({ id: 'GPA.1', purchaseToken: 'tok' })).toBe('tok');
    platform.OS = 'ios';
    expect(storeToken({ id: '2000001', purchaseToken: 'jws' })).toBe('2000001');
  });
});

import { describe, expect, it, vi } from 'vitest';

// The component file imports react-native; only the pure helper is tested.
vi.mock('react-native', () => ({
  StyleSheet: { create: (s: unknown) => s },
  Switch: () => null,
  View: () => null,
}));
vi.mock('@sc/ui', () => ({}));
vi.mock('../notifications/registerPushToken.js', () => ({
  registerPushToken: () => Promise.resolve('registered'),
}));
vi.mock('../api/client.js', () => ({ apiFetch: () => Promise.resolve() }));
vi.mock('../api/hooks/useMe.js', () => ({}));

const { describePushTest } = await import('./NotificationPreferences.js');

describe('describePushTest', () => {
  it('explains a phone that never registered', () => {
    expect(describePushTest({ devices: 0, delivered: 0, errors: [] })).toMatch(/isn't set up/);
  });
  it('says an app build without push setup needs an update, not a settings change', () => {
    expect(describePushTest({ devices: 0, delivered: 0, errors: [] }, 'unavailable')).toMatch(
      /next app update/,
    );
  });
  it('confirms a delivered test', () => {
    expect(describePushTest({ devices: 1, delivered: 1, errors: [] })).toMatch(/Test sent/);
  });
  it('names missing push credentials in plain words', () => {
    expect(describePushTest({ devices: 1, delivered: 0, errors: ['InvalidCredentials'] })).toMatch(
      /push setup isn't finished/,
    );
  });
});

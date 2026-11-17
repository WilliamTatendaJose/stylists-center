import { describe, expect, it, vi } from 'vitest';

// The hooks need a navigator; only the pure rules are exercised here.
vi.mock('expo-router', () => ({ useIsFocused: () => true }));

import { pollInterval, shouldRefetchOnRefocus } from './useFocusPolling.js';

describe('pollInterval', () => {
  it('polls only while the screen is focused', () => {
    expect(pollInterval(true, 30_000)).toBe(30_000);
    expect(pollInterval(false, 30_000)).toBe(false);
  });
});

describe('shouldRefetchOnRefocus', () => {
  const base = {
    focused: true,
    wasFocused: false,
    dataUpdatedAt: 1_000,
    now: 100_000,
    maxAgeMs: 30_000,
  };

  it('fetches when the user returns to a screen whose data went stale while hidden', () => {
    expect(shouldRefetchOnRefocus(base)).toBe(true);
  });

  it('leaves data that is still fresh alone', () => {
    expect(shouldRefetchOnRefocus({ ...base, dataUpdatedAt: 90_000 })).toBe(false);
  });

  it('does nothing while the screen stays focused or becomes hidden', () => {
    expect(shouldRefetchOnRefocus({ ...base, wasFocused: true })).toBe(false);
    expect(shouldRefetchOnRefocus({ ...base, focused: false })).toBe(false);
  });
});

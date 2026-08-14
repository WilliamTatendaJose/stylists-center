import { describe, expect, it } from 'vitest';
import {
  isSubscriptionActive,
  nextSubscriptionPaidUntil,
  SUBSCRIPTION_CYCLE_DAYS,
} from './subscription.js';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('isSubscriptionActive', () => {
  it('is never active for a provider who has never paid', () => {
    expect(isSubscriptionActive(null)).toBe(false);
  });

  it('is active while paidUntil is in the future', () => {
    const now = Date.now();
    expect(isSubscriptionActive(new Date(now + DAY_MS).toISOString(), now)).toBe(true);
  });

  it('is not active once paidUntil has passed', () => {
    const now = Date.now();
    expect(isSubscriptionActive(new Date(now - DAY_MS).toISOString(), now)).toBe(false);
  });
});

describe('nextSubscriptionPaidUntil', () => {
  it('extends a full cycle from now for a provider who has never paid', () => {
    const now = Date.now();
    const result = new Date(nextSubscriptionPaidUntil(null, now)).getTime();
    expect(result).toBe(now + SUBSCRIPTION_CYCLE_DAYS * DAY_MS);
  });

  it('extends from today when the current subscription already lapsed', () => {
    const now = Date.now();
    const longExpired = new Date(now - 90 * DAY_MS).toISOString();
    const result = new Date(nextSubscriptionPaidUntil(longExpired, now)).getTime();
    expect(result).toBe(now + SUBSCRIPTION_CYCLE_DAYS * DAY_MS);
  });

  it('extends from the current expiry, not today, so paying early keeps unused days', () => {
    const now = Date.now();
    const stillActiveUntil = new Date(now + 10 * DAY_MS).toISOString();
    const result = new Date(nextSubscriptionPaidUntil(stillActiveUntil, now)).getTime();
    expect(result).toBe(now + 10 * DAY_MS + SUBSCRIPTION_CYCLE_DAYS * DAY_MS);
  });
});

import { describe, expect, it } from 'vitest';
import { secondsRemaining, formatMmSs } from './countdownTime.js';

describe('secondsRemaining', () => {
  it('computes whole seconds remaining until expiry', () => {
    const now = Date.parse('2026-07-30T12:00:00.000Z');
    const expiresAt = '2026-07-30T12:05:00.000Z';
    expect(secondsRemaining(expiresAt, now)).toBe(300);
  });

  it('floors at zero rather than going negative once expired', () => {
    const now = Date.parse('2026-07-30T12:10:00.000Z');
    const expiresAt = '2026-07-30T12:05:00.000Z';
    expect(secondsRemaining(expiresAt, now)).toBe(0);
  });

  it('rounds to the nearest second', () => {
    const now = Date.parse('2026-07-30T12:00:00.400Z');
    const expiresAt = '2026-07-30T12:00:01.000Z';
    expect(secondsRemaining(expiresAt, now)).toBe(1);
  });
});

describe('formatMmSs', () => {
  it('formats the smart-match request TTL', () => {
    expect(formatMmSs(300)).toBe('5:00');
  });

  it('pads seconds under 10', () => {
    expect(formatMmSs(305)).toBe('5:05');
  });

  it('formats the provider offer TTL', () => {
    expect(formatMmSs(30)).toBe('0:30');
  });

  it('formats zero', () => {
    expect(formatMmSs(0)).toBe('0:00');
  });
});

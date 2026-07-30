import { describe, expect, it } from 'vitest';
import { formatInHarare, formatBookingWhen } from './time.js';

describe('formatInHarare', () => {
  it('renders in UTC+2 regardless of the runtime timezone', () => {
    // 10:00 UTC is 12:00 in Harare (UTC+2, no DST).
    expect(formatInHarare('2026-07-30T10:00:00.000Z', 'HH:mm')).toBe('12:00');
  });

  it('rolls the date forward across the UTC+2 boundary', () => {
    // 22:30 UTC on the 29th is 00:30 on the 30th in Harare.
    expect(formatInHarare('2026-07-29T22:30:00.000Z', 'yyyy-MM-dd HH:mm')).toBe('2026-07-30 00:30');
  });
});

describe('formatBookingWhen', () => {
  it('labels a same-day booking as "Today"', () => {
    const now = new Date('2026-07-30T09:00:00.000Z'); // 11:00 Harare
    expect(formatBookingWhen('2026-07-30T14:30:00.000Z', now)).toBe('Today 16:30');
  });

  it('labels a different-day booking with its weekday', () => {
    const now = new Date('2026-07-28T09:00:00.000Z'); // Tuesday in Harare
    expect(formatBookingWhen('2026-07-30T14:30:00.000Z', now)).toBe('Thu 16:30');
  });
});

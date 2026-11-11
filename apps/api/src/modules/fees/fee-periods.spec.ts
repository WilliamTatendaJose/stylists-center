import { describe, expect, it } from 'vitest';
import { harareDayStart, harareMonthKey, harareMonthStart, statementDueAt } from './fee-periods';

describe('fee periods (Africa/Harare)', () => {
  it('puts the month boundary at midnight Harare time, not UTC', () => {
    // 23:30 UTC on 31 Oct is already 01:30 on 1 Nov in Harare.
    expect(harareMonthKey(new Date('2026-10-31T23:30:00Z'))).toBe('2026-11');
    expect(harareMonthKey(new Date('2026-10-31T21:59:59Z'))).toBe('2026-10');
    expect(harareMonthStart('2026-11').toISOString()).toBe('2026-10-31T22:00:00.000Z');
  });

  it('is due on the due day of the following month, rolling over the year', () => {
    expect(statementDueAt('2026-10', 5).toISOString()).toBe('2026-11-04T22:00:00.000Z');
    expect(statementDueAt('2026-12', 5).toISOString()).toBe('2027-01-04T22:00:00.000Z');
  });

  it('finds the start of the Harare day', () => {
    expect(harareDayStart(new Date('2026-11-05T01:00:00Z')).toISOString()).toBe(
      '2026-11-04T22:00:00.000Z',
    );
    expect(harareDayStart(new Date('2026-11-04T22:00:00Z')).toISOString()).toBe(
      '2026-11-04T22:00:00.000Z',
    );
  });
});

import { describe, expect, it } from 'vitest';
import {
  needsCashReconciliation,
  isFullyConfirmed,
  formatBookingReference,
  formatOrderReference,
} from './booking.js';

const base = {
  paymentMethod: 'cash' as const,
  status: 'confirmed' as const,
  confirmedByClient: false,
  confirmedByProvider: false,
};

describe('cash reconciliation', () => {
  it('shows the panel for a confirmed cash booking neither side has confirmed', () => {
    expect(needsCashReconciliation(base)).toBe(true);
  });

  it('keeps showing it while only one side has confirmed', () => {
    expect(needsCashReconciliation({ ...base, confirmedByClient: true })).toBe(true);
    expect(needsCashReconciliation({ ...base, confirmedByProvider: true })).toBe(true);
  });

  it('hides it once both sides confirm', () => {
    expect(
      needsCashReconciliation({ ...base, confirmedByClient: true, confirmedByProvider: true }),
    ).toBe(false);
  });

  it('never applies to an EcoCash booking', () => {
    expect(needsCashReconciliation({ ...base, paymentMethod: 'ecocash' })).toBe(false);
  });

  it('never applies before the booking is confirmed or after it completes', () => {
    expect(needsCashReconciliation({ ...base, status: 'awaiting_provider' })).toBe(false);
    expect(needsCashReconciliation({ ...base, status: 'completed' })).toBe(false);
  });
});

describe('isFullyConfirmed', () => {
  it('requires both sides', () => {
    expect(isFullyConfirmed(true, false)).toBe(false);
    expect(isFullyConfirmed(false, true)).toBe(false);
    expect(isFullyConfirmed(true, true)).toBe(true);
  });
});

describe('reference formatting', () => {
  it('matches the handoff format for bookings', () => {
    expect(formatBookingReference(4471)).toBe('SC-4471');
  });

  it('pads a short booking sequence number', () => {
    expect(formatBookingReference(7)).toBe('SC-0007');
  });

  it('matches the handoff format for marketplace orders', () => {
    expect(formatOrderReference(22)).toBe('SC-M0022');
  });
});

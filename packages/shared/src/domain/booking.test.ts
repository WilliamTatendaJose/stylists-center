import { describe, expect, it } from 'vitest';
import {
  needsCashReconciliation,
  isFullyConfirmed,
  canCancelBooking,
  canProviderRespond,
  providerOwesCompletion,
  isLateCancellation,
  FREE_CANCELLATION_WINDOW_HOURS,
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

/**
 * This rule gates a refund — the API releases escrow back to the client on
 * cancel — so both directions matter: refusing a legitimate cancellation
 * traps someone into a no-show, and allowing a terminal one would unwind a
 * service that already happened.
 */
describe('cancellation eligibility', () => {
  it('allows a booking that has not happened yet', () => {
    expect(canCancelBooking('awaiting_provider')).toBe(true);
    expect(canCancelBooking('confirmed')).toBe(true);
  });

  it('refuses terminal states', () => {
    expect(canCancelBooking('completed')).toBe(false);
    expect(canCancelBooking('cancelled')).toBe(false);
    expect(canCancelBooking('declined')).toBe(false);
  });
});

describe('late cancellation window', () => {
  const NOW = Date.parse('2026-07-31T12:00:00.000Z');
  const hoursFromNow = (h: number) => new Date(NOW + h * 60 * 60 * 1000).toISOString();

  it('is free comfortably ahead of the appointment', () => {
    expect(isLateCancellation(hoursFromNow(24), NOW)).toBe(false);
    expect(isLateCancellation(hoursFromNow(3), NOW)).toBe(false);
  });

  it('is late inside the window', () => {
    expect(isLateCancellation(hoursFromNow(1), NOW)).toBe(true);
    expect(isLateCancellation(hoursFromNow(0.25), NOW)).toBe(true);
  });

  it('treats an appointment already under way as late', () => {
    expect(isLateCancellation(hoursFromNow(-1), NOW)).toBe(true);
  });

  it('is exclusive at the boundary, so exactly the window is still free', () => {
    expect(isLateCancellation(hoursFromNow(FREE_CANCELLATION_WINDOW_HOURS), NOW)).toBe(false);
  });

  it('does not call an unparseable date late — never penalise on bad data', () => {
    expect(isLateCancellation('not-a-date', NOW)).toBe(false);
  });
});

describe('provider response window', () => {
  it('can respond only while the client is still waiting', () => {
    expect(canProviderRespond('awaiting_provider')).toBe(true);
  });

  it('cannot respond once the booking has moved on', () => {
    for (const status of ['confirmed', 'completed', 'declined', 'cancelled'] as const) {
      expect(canProviderRespond(status)).toBe(false);
    }
  });
});

describe('provider completion confirmation', () => {
  const cashConfirmed = {
    paymentMethod: 'cash' as const,
    status: 'confirmed' as const,
    confirmedByProvider: false,
  };

  it('is owed on a confirmed cash job the stylist has not confirmed', () => {
    expect(providerOwesCompletion(cashConfirmed)).toBe(true);
  });

  it('is not owed once the stylist has confirmed', () => {
    expect(providerOwesCompletion({ ...cashConfirmed, confirmedByProvider: true })).toBe(false);
  });

  /** EcoCash releases on the client's confirmation alone, so the stylist is never the blocker. */
  it('is never owed on EcoCash', () => {
    expect(providerOwesCompletion({ ...cashConfirmed, paymentMethod: 'ecocash' })).toBe(false);
  });

  it('is not owed before the booking is confirmed', () => {
    expect(providerOwesCompletion({ ...cashConfirmed, status: 'awaiting_provider' })).toBe(false);
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

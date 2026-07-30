/**
 * Booking status and payment method (SRS §5.4 `Booking`, §3.9 payments).
 *
 * `awaiting_provider` -> `confirmed` -> `completed` is the EcoCash happy path.
 * Cash bookings sit in `confirmed` until BOTH `confirmDoneByClient` and
 * `confirmDoneByProvider` are true (see CompletionConfirmation in the API
 * schema) — that double confirmation is the only signal the platform has that
 * a cash booking happened at all, and its absence is the no-show signal.
 * `declined` covers a provider who does not confirm within the hour.
 */
export type BookingStatus =
  'awaiting_provider' | 'confirmed' | 'completed' | 'declined' | 'cancelled';

export type PaymentMethod = 'ecocash' | 'cash';

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  awaiting_provider: 'Awaiting stylist',
  confirmed: 'Confirmed',
  completed: 'Completed',
  declined: 'Declined',
  cancelled: 'Cancelled',
};

/**
 * A cash booking only counts as complete once both sides confirm in-app.
 * Used to decide whether the Bookings screen shows the reconciliation panel.
 */
export function needsCashReconciliation(params: {
  paymentMethod: PaymentMethod;
  status: BookingStatus;
  confirmedByClient: boolean;
  confirmedByProvider: boolean;
}): boolean {
  if (params.paymentMethod !== 'cash') return false;
  if (params.status !== 'confirmed') return false;
  return !(params.confirmedByClient && params.confirmedByProvider);
}

export function isFullyConfirmed(
  confirmedByClient: boolean,
  confirmedByProvider: boolean,
): boolean {
  return confirmedByClient && confirmedByProvider;
}

/** Reference codes shown on the Booked screen and in Bookings ("SC-4471"). */
export function formatBookingReference(sequenceNumber: number): string {
  return `SC-${sequenceNumber.toString().padStart(4, '0')}`;
}

export function formatOrderReference(sequenceNumber: number): string {
  return `SC-M${sequenceNumber.toString().padStart(4, '0')}`;
}

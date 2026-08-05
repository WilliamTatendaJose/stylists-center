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

/**
 * Statuses a client can still call off. Anything already finished, declined
 * or cancelled is terminal — cancelling those means nothing, and cancelling a
 * `completed` booking would unwind a service that has already been given.
 */
const CANCELLABLE_STATUSES: readonly BookingStatus[] = ['awaiting_provider', 'confirmed'];

/**
 * Whether a booking can still be cancelled.
 *
 * There was no way to cancel at all, while the Bookings screen warns that
 * five no-shows remove an account — so the app punished exactly the behaviour
 * it forced. Shared so the button the client renders and the rule the server
 * enforces cannot drift apart.
 */
export function canCancelBooking(status: BookingStatus): boolean {
  return CANCELLABLE_STATUSES.includes(status);
}

/**
 * How long before an appointment a client can still call it off freely.
 *
 * Two hours matches the boundary the product already uses elsewhere — the
 * exact address is only shared two hours ahead — so the same moment marks
 * "this is now a real commitment on both sides". It is also about the point
 * where a stylist can no longer sell the slot to someone else, which is the
 * thing a cancellation policy exists to protect.
 */
export const FREE_CANCELLATION_WINDOW_HOURS = 2;

/**
 * Whether cancelling now counts as late.
 *
 * Late cancellation is still allowed, deliberately. Blocking it does not
 * conjure attendance — it just converts a cancellation into a no-show, which
 * is strictly worse for the stylist, who then waits for someone who was never
 * coming. So the policy records it rather than preventing it, and the app
 * tells the client that before they confirm.
 */
export function isLateCancellation(startsAtIso: string, now: number = Date.now()): boolean {
  const startsAt = new Date(startsAtIso).getTime();
  if (Number.isNaN(startsAt)) return false;
  return startsAt - now < FREE_CANCELLATION_WINDOW_HOURS * 60 * 60 * 1000;
}

/**
 * Whether the stylist can still accept or turn down a request.
 *
 * Only while it is `awaiting_provider` — the status the client's own screen
 * labels "Awaiting stylist". Until now nothing could move a booking out of
 * it, so every booking a client made sat there permanently.
 */
export function canProviderRespond(status: BookingStatus): boolean {
  return status === 'awaiting_provider';
}

/**
 * Whether the stylist still owes a completion confirmation.
 *
 * Only cash needs the stylist's word: EcoCash escrow releases on the client's
 * confirmation alone (they are the one who received the service). A cash job
 * has no such signal, so both sides confirming is the only evidence the
 * platform ever gets that it happened.
 */
export function providerOwesCompletion(params: {
  paymentMethod: PaymentMethod;
  status: BookingStatus;
  confirmedByProvider: boolean;
}): boolean {
  return (
    params.paymentMethod === 'cash' && params.status === 'confirmed' && !params.confirmedByProvider
  );
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

import { create } from 'zustand';

/**
 * The booking whose Paynow payment is currently being waited on.
 *
 * This deliberately does NOT travel as route params. Handing the payment
 * screen its context through the URL meant the waiting screen could arrive
 * with nothing — a params guard then bounced the user to the home tab while
 * the booking sat unpaid on the server with a prompt already sent, which read
 * exactly like the checkout completing itself. A store has no serialisation
 * step to lose, and survives the re-render that clearing the booking draft
 * causes.
 *
 * Separate from the booking draft on purpose: confirming a booking resets
 * that draft, and this must outlive it.
 */
export interface PendingPayment {
  bookingId: string;
  reference: string;
  providerId: string;
  providerName: string;
  serviceName: string;
  whenLabel: string;
  areaName: string;
  /** Paynow's own wording for the phone prompt, when it sent one. */
  instructions?: string;
  /** Set instead when Paynow fell back to its hosted checkout page. */
  checkoutUrl?: string;
}

interface PendingPaymentState {
  pending: PendingPayment | null;
  setPending: (pending: PendingPayment) => void;
  clearPending: () => void;
}

export const usePendingPaymentStore = create<PendingPaymentState>((set) => ({
  pending: null,
  setPending: (pending) => set({ pending }),
  clearPending: () => set({ pending: null }),
}));

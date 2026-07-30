import { create } from 'zustand';
import type { BookingRowDto } from '@sc/shared';
import { needsCashReconciliation } from '@sc/shared';
import { BOOKING_ROWS } from '../fixtures/index.js';

/**
 * Bookings are eventually server state (Phase 3: `GET /v1/bookings`, sockets
 * pushing `booking.updated`) but in M1 they need real local mutation — the
 * cash reconciliation confirm button has to visibly change the row. A
 * TanStack Query cache entry would work too, but fighting its invalidation
 * model for what's actually local-only state until the API exists is more
 * complexity than a plain Zustand store seeded once from fixtures.
 */
export interface BookingsState {
  bookings: BookingRowDto[];
  /** The client's side of a cash reconciliation — confirming does NOT imply the provider has too. */
  confirmCashCompletion: (bookingId: string) => void;
}

export const useBookingsStore = create<BookingsState>((set) => ({
  bookings: BOOKING_ROWS,
  confirmCashCompletion: (bookingId) =>
    set((s) => ({
      bookings: s.bookings.map((b) => {
        if (b.id !== bookingId) return b;
        const confirmedByClient = true;
        const stillNeeds = needsCashReconciliation({
          paymentMethod: b.paymentMethod,
          status: b.status,
          confirmedByClient,
          confirmedByProvider: b.confirmedByProvider,
        });
        return {
          ...b,
          confirmedByClient,
          status: stillNeeds ? b.status : 'completed',
          canRate: !stillNeeds,
        };
      }),
    })),
}));

import { create } from 'zustand';
import type { PaymentMethod } from '@sc/shared';

/**
 * Choose a slot -> Payment -> Booked. Reset once the booking is confirmed.
 *
 * `matchId` carries the smart-match this booking is settling, if any (set
 * alongside `providerId` since Provider profile is the one screen reachable
 * both from an accepted offer and from a plain browse/Home entry) — passed
 * through to `POST /v1/bookings` so the API can confirm the match and
 * auto-supersede any other accepted offers for it (plan §6).
 */
export interface BookingDraftState {
  providerId: string | null;
  serviceId: string | null;
  date: string | null;
  time: string | null;
  paymentMethod: PaymentMethod;
  matchId: string | null;
  setProvider: (providerId: string, matchId?: string | null) => void;
  setService: (serviceId: string) => void;
  setSlot: (date: string, time: string) => void;
  setPaymentMethod: (method: PaymentMethod) => void;
  reset: () => void;
}

const INITIAL = {
  providerId: null,
  serviceId: null,
  date: null,
  time: null,
  paymentMethod: 'ecocash' as PaymentMethod,
  matchId: null,
};

export const useBookingDraftStore = create<BookingDraftState>((set) => ({
  ...INITIAL,
  setProvider: (providerId, matchId = null) => set({ providerId, matchId }),
  setService: (serviceId) => set({ serviceId }),
  setSlot: (date, time) => set({ date, time }),
  setPaymentMethod: (paymentMethod) => set({ paymentMethod }),
  reset: () => set(INITIAL),
}));

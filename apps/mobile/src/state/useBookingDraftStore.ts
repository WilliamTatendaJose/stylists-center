import { create } from 'zustand';

/**
 * Choose a slot -> Confirm -> Booked. Reset once the booking is confirmed.
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
  matchId: string | null;
  rescheduleBookingId: string | null;
  setProvider: (providerId: string, matchId?: string | null) => void;
  startReschedule: (bookingId: string, providerId: string, serviceId: string) => void;
  setService: (serviceId: string) => void;
  setSlot: (date: string, time: string) => void;
  reset: () => void;
}

const INITIAL = {
  providerId: null,
  serviceId: null,
  date: null,
  time: null,
  matchId: null,
  rescheduleBookingId: null,
};

export const useBookingDraftStore = create<BookingDraftState>((set) => ({
  ...INITIAL,
  setProvider: (providerId, matchId = null) =>
    set({ providerId, matchId, rescheduleBookingId: null }),
  startReschedule: (rescheduleBookingId, providerId, serviceId) =>
    set({ rescheduleBookingId, providerId, serviceId, matchId: null, date: null, time: null }),
  setService: (serviceId) => set({ serviceId }),
  setSlot: (date, time) => set({ date, time }),
  reset: () => set(INITIAL),
}));

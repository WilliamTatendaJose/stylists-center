import { create } from 'zustand';
import type { PaymentMethod } from '@sc/shared';

/** Choose a slot -> Payment -> Booked. Reset once the booking is confirmed. */
export interface BookingDraftState {
  providerId: string | null;
  serviceId: string | null;
  date: string | null;
  time: string | null;
  paymentMethod: PaymentMethod;
  matchId: string | null;
  setProvider: (providerId: string) => void;
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
  setProvider: (providerId) => set({ providerId }),
  setService: (serviceId) => set({ serviceId }),
  setSlot: (date, time) => set({ date, time }),
  setPaymentMethod: (paymentMethod) => set({ paymentMethod }),
  reset: () => set(INITIAL),
}));

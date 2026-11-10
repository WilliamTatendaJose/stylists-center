import { create } from 'zustand';
import type { PayChannel, PaymentAction } from '@sc/shared';

export interface PendingSubscription {
  reference?: string;
  priceUsdCents: number;
  instructions?: string;
  checkoutUrl?: string;
  /** An InnBucks code to show, or an O'mari OTP to collect, before the payment can settle. */
  action?: PaymentAction;
  payChannel?: PayChannel;
}

interface PendingSubscriptionState {
  pending: PendingSubscription | null;
  setPending: (pending: PendingSubscription) => void;
  clearPending: () => void;
}

export const usePendingSubscriptionStore = create<PendingSubscriptionState>((set) => ({
  pending: null,
  setPending: (pending) => set({ pending }),
  clearPending: () => set({ pending: null }),
}));

import { create } from 'zustand';

export interface PendingSubscription {
  reference?: string;
  priceUsdCents: number;
  instructions?: string;
  checkoutUrl?: string;
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

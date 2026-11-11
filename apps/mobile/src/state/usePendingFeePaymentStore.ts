import { create } from 'zustand';
import type { PayChannel, PaymentAction } from '@sc/shared';

/** A fee payment that has been started and is waiting for the gateway's verdict. */
export interface PendingFeePayment {
  reference?: string;
  amountUsdCents: number;
  instructions?: string;
  checkoutUrl?: string;
  /** An InnBucks code to show, or an O'mari OTP to collect, before the payment can settle. */
  action?: PaymentAction;
  payChannel?: PayChannel;
}

interface PendingFeePaymentState {
  pending: PendingFeePayment | null;
  setPending: (pending: PendingFeePayment) => void;
  clearPending: () => void;
}

export const usePendingFeePaymentStore = create<PendingFeePaymentState>((set) => ({
  pending: null,
  setPending: (pending) => set({ pending }),
  clearPending: () => set({ pending: null }),
}));

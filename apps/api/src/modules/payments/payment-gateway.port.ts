export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

export interface PaymentCheckoutInput {
  reference: string;
  amountUsdCents: number;
  description: string;
  /**
   * Customer's phone number (E.164). When set, the gateway pushes a mobile
   * money prompt directly to this number instead of returning a browser
   * checkout URL.
   */
  phone?: string;
  /** Prevent a phone-prompt failure from opening a hosted browser checkout. */
  allowHostedCheckout?: boolean;
}

export interface PaymentIntentResult {
  /** Paynow poll URL, or a deterministic fake reference in development. */
  externalRef: string;
  status: 'held' | 'pending' | 'failed';
  checkoutUrl?: string;
  /** USSD/mobile prompt instructions for the customer — set instead of checkoutUrl when `phone` was supplied. */
  instructions?: string;
  provider: 'fake-ecocash' | 'paynow';
}

/** The ledger status a gateway can report back once a payment has moved past its initial state. */
export type PaymentPollStatus = 'pending' | 'paid' | 'refunded' | 'failed' | 'disputed';

/**
 * All payment gateway calls stay on the API. The client receives only a
 * Paynow-hosted checkout URL or phone-prompt instructions; integration keys
 * never leave the server.
 */
export interface PaymentGatewayPort {
  createCheckout(input: PaymentCheckoutInput): Promise<PaymentIntentResult>;
  verifyCallback(fields: Record<string, string>): boolean;
  /**
   * Actively asks the gateway for a status update, rather than only waiting
   * for its webhook — the inbound webhook can never reach a non-public dev
   * server, and even in production this closes the gap between "the customer
   * approved on their phone" and "the webhook arrived".
   */
  pollStatus(externalRef: string): Promise<PaymentPollStatus>;
}

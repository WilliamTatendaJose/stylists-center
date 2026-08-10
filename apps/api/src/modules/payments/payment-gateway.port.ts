export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

export interface PaymentCheckoutInput {
  reference: string;
  amountUsdCents: number;
  description: string;
}

export interface PaymentIntentResult {
  /** Paynow poll URL, or a deterministic fake reference in development. */
  externalRef: string;
  status: 'held' | 'pending' | 'failed';
  checkoutUrl?: string;
  provider: 'fake-ecocash' | 'paynow';
}

/**
 * All payment gateway calls stay on the API. The client receives only a
 * Paynow-hosted checkout URL; integration keys never leave the server.
 */
export interface PaymentGatewayPort {
  createCheckout(input: PaymentCheckoutInput): Promise<PaymentIntentResult>;
  verifyCallback(fields: Record<string, string>): boolean;
}

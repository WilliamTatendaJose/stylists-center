export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

/** The gateways this app can be pointed at, as they are recorded on `Payment.provider`. */
export type PaymentProvider = 'fake-ecocash' | 'paynow' | 'pesepay';

/**
 * Ledger `provider` values that name a real gateway worth asking for a status
 * update. The fake dev adapter settles instantly, so a row it wrote is already
 * final and polling it would only ever confirm what is stored.
 */
export const POLLABLE_PROVIDERS: ReadonlySet<string> = new Set<PaymentProvider>([
  'paynow',
  'pesepay',
]);

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
  /** Whatever the gateway wants back when asked for a status: a Paynow poll URL, a Pesepay reference number, or a deterministic fake reference in development. */
  externalRef: string;
  status: 'held' | 'pending' | 'failed';
  checkoutUrl?: string;
  /** USSD/mobile prompt instructions for the customer — set instead of checkoutUrl when `phone` was supplied. */
  instructions?: string;
  provider: PaymentProvider;
}

/** The ledger status a gateway can report back once a payment has moved past its initial state. */
export type PaymentPollStatus = 'pending' | 'paid' | 'refunded' | 'failed' | 'disputed';

/**
 * What an inbound result callback turns out to have been about, once the
 * gateway itself has confirmed it.
 */
export interface PaymentConfirmation {
  /** The reference this app initiated the checkout under — the booking/order/subscription reference. */
  reference: string;
  /** The gateway's own reference for the transaction. */
  externalRef: string;
  status: PaymentPollStatus;
  amountUsdCents: number;
}

/**
 * All payment gateway calls stay on the API. The client receives only a
 * gateway-hosted checkout URL or phone-prompt instructions; integration keys
 * never leave the server.
 */
export interface PaymentGatewayPort {
  createCheckout(input: PaymentCheckoutInput): Promise<PaymentIntentResult>;
  /**
   * True when the gateway signed this callback and the signature checks out.
   * A gateway that does not sign its callbacks at all returns false here and
   * implements `confirmCallback` instead — an unsigned body is a hint that
   * something happened, never evidence of what.
   */
  verifyCallback(fields: Record<string, string>): boolean;
  /**
   * Actively asks the gateway for a status update, rather than only waiting
   * for its webhook — the inbound webhook can never reach a non-public dev
   * server, and even in production this closes the gap between "the customer
   * approved on their phone" and "the webhook arrived".
   */
  pollStatus(externalRef: string): Promise<PaymentPollStatus>;
  /**
   * Reads an unsigned result callback and asks the gateway, over the
   * authenticated API, what actually happened. Set only by gateways whose
   * callbacks carry no signature (Pesepay); gateways that sign theirs
   * (Paynow) leave this unset and are trusted through `verifyCallback`.
   */
  confirmCallback?(body: Record<string, unknown>): Promise<PaymentConfirmation>;
}

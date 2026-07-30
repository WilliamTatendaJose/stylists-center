export interface PaymentIntentResult {
  externalRef: string;
  status: 'held' | 'failed';
}

/**
 * Plan §6/R3: EcoCash escrow is a commercial/legal integration, not just an
 * engineering one — real access runs through an aggregator and takes weeks to
 * onboard. This port isolates that behind an interface so swapping the fake
 * adapter for a real one later is a provider binding change, not a rewrite of
 * BookingsService.
 */
export interface PaymentGatewayPort {
  chargeToEscrow(amountUsdCents: number): Promise<PaymentIntentResult>;
}

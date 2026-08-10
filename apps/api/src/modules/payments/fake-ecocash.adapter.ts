import { Injectable } from '@nestjs/common';
import type { PaymentGatewayPort, PaymentIntentResult } from './payment-gateway.port';

/** Local/test-only settlement stand-in. Production binds the Paynow adapter. */
@Injectable()
export class FakeEcoCashAdapter implements PaymentGatewayPort {
  createCheckout(): Promise<PaymentIntentResult> {
    return Promise.resolve({
      externalRef: `fake-ecocash-${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`,
      status: 'held',
      provider: 'fake-ecocash',
    });
  }

  verifyCallback(): boolean {
    return false;
  }
}
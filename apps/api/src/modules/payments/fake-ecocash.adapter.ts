import { Injectable } from '@nestjs/common';
import type { PaymentGatewayPort, PaymentIntentResult } from './payment-gateway.port';

/** Auto-succeeds instantly (plan §9's dev-only EcoCash stub) — holds the full amount in escrow, released on the client's completion confirmation. */
@Injectable()
export class FakeEcoCashAdapter implements PaymentGatewayPort {
  chargeToEscrow(): Promise<PaymentIntentResult> {
    return Promise.resolve({
      externalRef: `fake-ecocash-${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`,
      status: 'held',
    });
  }
}

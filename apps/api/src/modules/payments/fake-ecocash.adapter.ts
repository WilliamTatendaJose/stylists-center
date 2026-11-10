import { Injectable } from '@nestjs/common';
import type { PayChannel } from '@sc/shared';
import type {
  PaymentCheckoutInput,
  PaymentGatewayPort,
  PaymentIntentResult,
  PaymentPollStatus,
} from './payment-gateway.port';

/** Local/test-only settlement stand-in. Production binds the Paynow adapter. */
@Injectable()
export class FakeEcoCashAdapter implements PaymentGatewayPort {
  /** Every channel, so each one's screens can be walked through in dev. All of them settle instantly. */
  readonly supportedChannels: readonly PayChannel[] = [
    'ecocash',
    'onemoney',
    'innbucks',
    'omari',
    'card',
  ];

  createCheckout(input: PaymentCheckoutInput): Promise<PaymentIntentResult> {
    return Promise.resolve({
      externalRef: `fake-ecocash-${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`,
      status: 'held',
      ...(input.phone
        ? { instructions: `Dev mode: pretending a prompt was sent to ${input.phone}.` }
        : {}),
      provider: 'fake-ecocash',
    });
  }

  verifyCallback(): boolean {
    return false;
  }

  /** `createCheckout` already returns the terminal 'held' status — nothing ever needs polling in dev. */
  pollStatus(): Promise<PaymentPollStatus> {
    return Promise.resolve('paid');
  }
}

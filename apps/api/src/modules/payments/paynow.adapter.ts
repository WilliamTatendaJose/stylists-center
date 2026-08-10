import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Env } from '../../config/env';
import type { PaymentCheckoutInput, PaymentGatewayPort, PaymentIntentResult } from './payment-gateway.port';

const INITIATE_URL = 'https://www.paynow.co.zw/interface/initiatetransaction';

@Injectable()
export class PaynowAdapter implements PaymentGatewayPort {
  constructor(private readonly config: ConfigService<Env, true>) {}

  async createCheckout(input: PaymentCheckoutInput): Promise<PaymentIntentResult> {
    const integrationId = this.config.get('PAYNOW_INTEGRATION_ID', { infer: true });
    const integrationKey = this.config.get('PAYNOW_INTEGRATION_KEY', { infer: true });
    const returnUrl = this.config.get('PAYNOW_RETURN_URL', { infer: true });
    const resultUrl = this.config.get('PAYNOW_RESULT_URL', { infer: true });
    if (!integrationId || !integrationKey || !returnUrl || !resultUrl) {
      throw new ServiceUnavailableException('Paynow is not configured');
    }

    const fields: [string, string][] = [
      ['id', integrationId],
      ['reference', input.reference],
      ['amount', formatCents(input.amountUsdCents)],
      ['additionalinfo', input.description],
      ['returnurl', returnUrl],
      ['resulturl', resultUrl],
      ['status', 'Message'],
    ];
    const body = new URLSearchParams(fields);
    body.set('hash', this.hash(fields.map(([, value]) => value), integrationKey));

    let response: Response;
    try {
      response = await fetch(INITIATE_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
      });
    } catch {
      throw new ServiceUnavailableException('Paynow could not be reached');
    }
    const payload = await response.text();
    if (!response.ok) throw new ServiceUnavailableException('Paynow rejected the checkout request');

    const reply = Object.fromEntries([...new URLSearchParams(payload)].map(([key, value]) => [key.toLowerCase(), value]));
    if (reply.status?.toLowerCase() !== 'ok' || !reply.browserurl || !reply.pollurl) {
      throw new ServiceUnavailableException(reply.error ?? 'Paynow did not create a checkout');
    }
    if (!this.verifyCallback(reply)) {
      throw new ServiceUnavailableException('Paynow returned an invalid checkout signature');
    }

    return {
      externalRef: reply.pollurl,
      status: 'pending',
      checkoutUrl: reply.browserurl,
      provider: 'paynow',
    };
  }

  verifyCallback(fields: Record<string, string>): boolean {
    const key = this.config.get('PAYNOW_INTEGRATION_KEY', { infer: true });
    const supplied = fields.hash;
    if (!key || !supplied) return false;
    const values = Object.entries(fields)
      .filter(([name]) => name.toLowerCase() !== 'hash')
      .map(([, value]) => value);
    const expected = this.hash(values, key);
    const expectedBuffer = Buffer.from(expected, 'utf8');
    const suppliedBuffer = Buffer.from(supplied.toUpperCase(), 'utf8');
    return expectedBuffer.length === suppliedBuffer.length && timingSafeEqual(expectedBuffer, suppliedBuffer);
  }

  private hash(values: string[], key: string): string {
    return createHash('sha512').update(values.join('') + key, 'utf8').digest('hex').toUpperCase();
  }
}

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

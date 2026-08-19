import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Env } from '../../config/env';
import { ledgerStatus } from './ledger-status';
import type {
  PaymentCheckoutInput,
  PaymentGatewayPort,
  PaymentIntentResult,
  PaymentPollStatus,
} from './payment-gateway.port';

const INITIATE_URL = 'https://www.paynow.co.zw/interface/initiatetransaction';
const MOBILE_INITIATE_URL = 'https://www.paynow.co.zw/interface/remotetransaction';

@Injectable()
export class PaynowAdapter implements PaymentGatewayPort {
  private readonly logger = new Logger(PaynowAdapter.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  async createCheckout(input: PaymentCheckoutInput): Promise<PaymentIntentResult> {
    const integrationId = this.config.get('PAYNOW_INTEGRATION_ID', { infer: true });
    const integrationKey = this.config.get('PAYNOW_INTEGRATION_KEY', { infer: true });
    const returnUrl = this.config.get('PAYNOW_RETURN_URL', { infer: true });
    const resultUrl = this.config.get('PAYNOW_RESULT_URL', { infer: true });
    if (!integrationId || !integrationKey || !returnUrl || !resultUrl) {
      throw new ServiceUnavailableException('Paynow is not configured');
    }

    // Express Checkout only reaches a number registered for the chosen mobile
    // money network. A customer paying by card, or whose login number is not
    // an EcoCash line, gets rejected here — so fall back to the hosted page
    // rather than leaving them unable to pay at all. Both routes return a
    // pollurl, so the caller still learns the real outcome either way.
    if (input.phone) {
      try {
        return await this.createMobileCheckout(
          { ...input, phone: input.phone },
          { integrationId, integrationKey, returnUrl, resultUrl },
        );
      } catch (error) {
        this.logger.warn(
          `Paynow mobile checkout for ${input.reference} failed, falling back to hosted checkout: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
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
    body.set(
      'hash',
      this.hash(
        fields.map(([, value]) => value),
        integrationKey,
      ),
    );

    const reply = await this.post(INITIATE_URL, body);
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

  /**
   * Express Checkout: pushes a USSD prompt straight to the customer's phone
   * instead of opening a browser (developers.paynow.co.zw/docs/
   * express_checkout_transactions.html). Unlike the web-redirect flow,
   * Paynow requires `authemail` here — and in test mode it must match one of
   * the merchant account's own login emails, not the customer's.
   */
  private async createMobileCheckout(
    input: PaymentCheckoutInput & { phone: string },
    creds: { integrationId: string; integrationKey: string; returnUrl: string; resultUrl: string },
  ): Promise<PaymentIntentResult> {
    const authEmail = this.config.get('PAYNOW_AUTH_EMAIL', { infer: true });
    if (!authEmail) {
      throw new ServiceUnavailableException('Paynow mobile checkout requires PAYNOW_AUTH_EMAIL');
    }

    const fields: [string, string][] = [
      ['id', creds.integrationId],
      ['reference', input.reference],
      ['amount', formatCents(input.amountUsdCents)],
      ['additionalinfo', input.description],
      ['returnurl', creds.returnUrl],
      ['resulturl', creds.resultUrl],
      ['authemail', authEmail],
      ['phone', toLocalPhone(input.phone)],
      ['method', 'ecocash'],
      ['status', 'Message'],
    ];
    const body = new URLSearchParams(fields);
    body.set(
      'hash',
      this.hash(
        fields.map(([, value]) => value),
        creds.integrationKey,
      ),
    );

    const reply = await this.post(MOBILE_INITIATE_URL, body);
    if (reply.status?.toLowerCase() !== 'ok' || !reply.pollurl) {
      throw new ServiceUnavailableException(
        reply.error ?? 'Paynow did not accept the mobile checkout',
      );
    }
    if (!this.verifyCallback(reply)) {
      throw new ServiceUnavailableException('Paynow returned an invalid checkout signature');
    }

    return {
      externalRef: reply.pollurl,
      status: 'pending',
      ...(reply.instructions ? { instructions: reply.instructions } : {}),
      provider: 'paynow',
    };
  }

  /** Empty POST to the stored poll URL — Paynow's documented way to ask for a status update on demand. */
  async pollStatus(externalRef: string): Promise<PaymentPollStatus> {
    const reply = await this.post(externalRef, new URLSearchParams());
    if (!this.verifyCallback(reply)) {
      throw new ServiceUnavailableException('Paynow returned an invalid poll signature');
    }
    return ledgerStatus(reply.status);
  }

  private async post(url: string, body: URLSearchParams): Promise<Record<string, string>> {
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
      });
    } catch {
      throw new ServiceUnavailableException('Paynow could not be reached');
    }
    const payload = await response.text();
    if (!response.ok) throw new ServiceUnavailableException('Paynow rejected the request');
    return Object.fromEntries(
      [...new URLSearchParams(payload)].map(([key, value]) => [key.toLowerCase(), value]),
    );
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
    return (
      expectedBuffer.length === suppliedBuffer.length &&
      timingSafeEqual(expectedBuffer, suppliedBuffer)
    );
  }

  private hash(values: string[], key: string): string {
    return createHash('sha512')
      .update(values.join('') + key, 'utf8')
      .digest('hex')
      .toUpperCase();
  }
}

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Paynow's mobile transaction API expects a local "0771234567" number, not the app's stored E.164 "+263771234567". */
function toLocalPhone(e164: string): string {
  return e164.startsWith('+263') ? `0${e164.slice(4)}` : e164;
}

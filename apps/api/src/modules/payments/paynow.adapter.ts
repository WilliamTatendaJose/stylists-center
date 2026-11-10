import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'node:crypto';
import { PAY_CHANNEL_LABELS, type PayChannel } from '@sc/shared';
import type { Env } from '../../config/env';
import { ledgerStatus } from './ledger-status';
import type {
  PaymentCheckoutInput,
  PaymentGatewayPort,
  PaymentIntentResult,
  PaymentPollStatus,
} from './payment-gateway.port';
import { assertChannelOffered } from './pay-channels';
import { toLocalPhone } from './phone-format';

const INITIATE_URL = 'https://www.paynow.co.zw/interface/initiatetransaction';
const MOBILE_INITIATE_URL = 'https://www.paynow.co.zw/interface/remotetransaction';

/** The `method` value Paynow's Express Checkout expects for each in-app channel. */
const EXPRESS_METHOD: Record<Exclude<PayChannel, 'card'>, string> = {
  ecocash: 'ecocash',
  onemoney: 'onemoney',
  innbucks: 'innbucks',
  omari: 'omari',
};

/**
 * Paynow refused the payment itself, rather than the method.
 *
 * Surfaced to the caller as a 400 so the booking or order is never written:
 * there is no point creating one, and no second route worth trying — the
 * customer's wallet said no. Distinct from the gateway being unreachable or
 * refusing this *number*, both of which are worth falling back for.
 */
export class PaynowDeclinedError extends BadRequestException {}

/**
 * Paynow returns free text, so this matches on the phrases it actually sends
 * for a refused payment rather than a code it does not give us.
 */
function isDecline(error: string): boolean {
  return /insufficient|balance|declin|not enough|limit exceeded/i.test(error);
}

@Injectable()
export class PaynowAdapter implements PaymentGatewayPort {
  private readonly logger = new Logger(PaynowAdapter.name);

  readonly supportedChannels: readonly PayChannel[] = [
    'ecocash',
    'onemoney',
    'innbucks',
    'omari',
    'card',
  ];

  constructor(private readonly config: ConfigService<Env, true>) {}

  async createCheckout(input: PaymentCheckoutInput): Promise<PaymentIntentResult> {
    const integrationId = this.config.get('PAYNOW_INTEGRATION_ID', { infer: true });
    const integrationKey = this.config.get('PAYNOW_INTEGRATION_KEY', { infer: true });
    const returnUrl = this.config.get('PAYNOW_RETURN_URL', { infer: true });
    const resultUrl = this.config.get('PAYNOW_RESULT_URL', { infer: true });
    if (!integrationId || !integrationKey || !returnUrl || !resultUrl) {
      throw new ServiceUnavailableException('Paynow is not configured');
    }
    const creds = { integrationId, integrationKey, returnUrl, resultUrl };
    const channel = input.channel ?? 'ecocash';
    assertChannelOffered(channel, this, this.config.get('PAYMENT_CHANNELS', { infer: true }));

    // Card goes straight to Paynow's hosted page. Express Checkout only takes
    // a card as a token from an earlier tokenised payment, and collecting raw
    // card details in this app would put it in scope for PCI compliance.
    if (channel === 'card') {
      if (input.allowHostedCheckout === false) {
        throw new BadRequestException('Card payments are not available for this purchase');
      }
      return this.createHostedCheckout(input, creds);
    }

    // Express Checkout only reaches a number registered for the chosen mobile
    // money network. A customer paying by card, or whose login number is not
    // an EcoCash line, gets rejected here — so fall back to the hosted page
    // rather than leaving them unable to pay at all. Both routes return a
    // pollurl, so the caller still learns the real outcome either way.
    if (input.phone) {
      try {
        return await this.createMobileCheckout({ ...input, phone: input.phone }, channel, creds);
      } catch (error) {
        // A DECLINE is not a reason to fall back. "Insufficient balance" means
        // Paynow looked at this payment and refused it — quietly opening a
        // card page instead hides that answer and lets the booking proceed as
        // though nothing was wrong. Only a refusal of the *method* (an
        // unregistered line, a test-mode number) earns the hosted page.
        if (error instanceof PaynowDeclinedError) throw error;
        if (input.allowHostedCheckout === false) {
          if (error instanceof Error) throw error;
          throw new ServiceUnavailableException(
            `The in-app ${PAY_CHANNEL_LABELS[channel]} payment could not be started`,
          );
        }
        this.logger.warn(
          `Paynow mobile checkout for ${input.reference} failed, falling back to hosted checkout: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return this.createHostedCheckout(input, creds);
  }

  /** Paynow's hosted page: the customer picks a method (and enters any card details) there. */
  private async createHostedCheckout(
    input: PaymentCheckoutInput,
    creds: { integrationId: string; integrationKey: string; returnUrl: string; resultUrl: string },
  ): Promise<PaymentIntentResult> {
    const { integrationId, integrationKey, returnUrl, resultUrl } = creds;
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
    channel: Exclude<PayChannel, 'card'>,
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
      ['method', EXPRESS_METHOD[channel]],
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
      const error = reply.error ?? 'Paynow did not accept the mobile checkout';
      if (isDecline(error)) throw new PaynowDeclinedError(error);
      throw new ServiceUnavailableException(error);
    }
    if (!this.verifyCallback(reply)) {
      throw new ServiceUnavailableException('Paynow returned an invalid checkout signature');
    }

    const base = {
      externalRef: reply.pollurl,
      status: 'pending' as const,
      provider: 'paynow' as const,
    };

    // InnBucks never pushes a prompt: Paynow hands back a code the customer
    // enters in (or is deep-linked into) the InnBucks app.
    if (channel === 'innbucks') {
      const code = reply.authorizationcode;
      if (!code) throw new ServiceUnavailableException('Paynow did not return an InnBucks code');
      return {
        ...base,
        instructions: `Open InnBucks and enter code ${code} to pay.`,
        action: {
          kind: 'innbucks',
          authorizationCode: code,
          ...(reply.authorizationexpires ? { expiresLabel: reply.authorizationexpires } : {}),
        },
      };
    }

    // O'mari texts the customer a one-time code; nothing settles until that
    // code is posted to the URL Paynow returns here.
    if (channel === 'omari') {
      const otpUrl = reply.remoteotpurl;
      if (!otpUrl)
        throw new ServiceUnavailableException("Paynow did not start the O'mari code step");
      return {
        ...base,
        instructions: "Enter the code O'mari sent you by SMS.",
        action: {
          kind: 'otp',
          ...(reply.otpreference ? { otpReference: reply.otpreference } : {}),
        },
        otpUrl,
      };
    }

    return {
      ...base,
      instructions:
        reply.instructions ?? `Approve the ${PAY_CHANNEL_LABELS[channel]} prompt on your phone.`,
    };
  }

  /**
   * Posts an O'mari one-time code to the `remoteotpurl` Paynow returned when
   * the payment started. A wrong code comes back as `status=Error`; Paynow
   * cancels the payment after five wrong attempts.
   */
  async submitOtp(otpUrl: string, otp: string): Promise<void> {
    const integrationId = this.config.get('PAYNOW_INTEGRATION_ID', { infer: true });
    const integrationKey = this.config.get('PAYNOW_INTEGRATION_KEY', { infer: true });
    if (!integrationId || !integrationKey) {
      throw new ServiceUnavailableException('Paynow is not configured');
    }
    // The URL came from a signed Paynow reply, but it is still a URL this
    // server is about to POST a secret-derived hash to, so it must be Paynow's.
    if (!isPaynowUrl(otpUrl)) {
      throw new ServiceUnavailableException("Stored O'mari code URL is not a Paynow address");
    }

    const fields: [string, string][] = [
      ['id', integrationId],
      ['otp', otp],
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

    const reply = await this.post(otpUrl, body);
    if (reply.status?.toLowerCase() === 'error') {
      throw new BadRequestException(reply.error ?? 'That code was not accepted');
    }
    // A success reply is a normal status update. It is not written to the
    // ledger from here (the poll and the callback already do that), but a
    // signature that is present and wrong means the reply is not Paynow's.
    if (reply.hash && !this.verifyCallback(reply)) {
      throw new ServiceUnavailableException('Paynow returned an invalid OTP reply signature');
    }
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

function isPaynowUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      (url.hostname === 'paynow.co.zw' || url.hostname.endsWith('.paynow.co.zw'))
    );
  } catch {
    return false;
  }
}

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv } from 'node:crypto';
import type { Env } from '../../config/env';
import type {
  PaymentCheckoutInput,
  PaymentConfirmation,
  PaymentGatewayPort,
  PaymentIntentResult,
  PaymentPollStatus,
} from './payment-gateway.port';
import { pesepayLedgerStatus } from './pesepay-status';
import { toLocalPhone } from './phone-format';

const LIVE_BASE_URL = 'https://api.pesepay.com/api/payments-engine';
const SANDBOX_BASE_URL = 'https://api.test.sandbox.pesepay.com/payments-engine';

/**
 * Pesepay's seamless ("make payment") endpoint is v2 on live but only v1 in
 * the sandbox — the one place the two environments are not the same API.
 */
const LIVE_SEAMLESS_PATH = '/v2/payments/make-payment';
const SANDBOX_SEAMLESS_PATH = '/v1/payments/make-payment';

/** AES-256-CBC needs a 32-byte key; Pesepay's encryption key is exactly that, and its first 16 bytes are the IV. */
const IV_LENGTH = 16;

/**
 * Pesepay refused the payment itself, rather than the method.
 *
 * Surfaced as a 400 so the booking or order is never written: the customer's
 * wallet said no, and quietly opening a card page instead would hide that
 * answer. Distinct from Pesepay being unreachable or refusing this *number*,
 * both of which are worth falling back for. Mirrors PaynowDeclinedError.
 */
export class PesepayDeclinedError extends BadRequestException {}

/**
 * Statuses that mean "we asked, and the answer is no" — as opposed to the
 * gateway or the payment method being unable to try at all, which is what
 * earns a fallback to the hosted checkout page.
 */
const DECLINE_STATUSES = new Set([
  'AUTHORIZATION_FAILED',
  'CANCELLED',
  'DECLINED',
  'INSUFFICIENT_FUNDS',
  'TERMINATED',
]);

interface PesepayTransaction {
  amountDetails?: { amount?: number; currencyCode?: string };
  merchantReference?: string;
  paymentMethodDetails?: { paymentMethodMessage?: string };
  pollUrl?: string;
  redirectUrl?: string;
  referenceNumber?: string;
  transactionStatus?: string;
  transactionStatusDescription?: string;
}

interface PesepayCredentials {
  integrationKey: string;
  encryptionKey: string;
  returnUrl: string;
  resultUrl: string;
}

@Injectable()
export class PesepayAdapter implements PaymentGatewayPort {
  private readonly logger = new Logger(PesepayAdapter.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  async createCheckout(input: PaymentCheckoutInput): Promise<PaymentIntentResult> {
    const creds = this.credentials();

    // Seamless checkout only reaches a number registered for the chosen mobile
    // money network. A customer paying by card, or whose login number is not
    // an EcoCash line, is rejected there — so fall back to the hosted page
    // rather than leaving them unable to pay at all. Both routes return a
    // referenceNumber, so the caller still learns the real outcome either way.
    if (input.phone) {
      try {
        return await this.createSeamlessCheckout({ ...input, phone: input.phone }, creds);
      } catch (error) {
        if (error instanceof PesepayDeclinedError) throw error;
        if (input.allowHostedCheckout === false) {
          if (error instanceof Error) throw error;
          throw new ServiceUnavailableException('The in-app EcoCash prompt could not be started');
        }
        this.logger.warn(
          `Pesepay seamless checkout for ${input.reference} failed, falling back to hosted checkout: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    const transaction = await this.send<PesepayTransaction>(
      'POST',
      '/v1/payments/initiate',
      creds,
      {
        amountDetails: {
          amount: toMajorUnits(input.amountUsdCents),
          currencyCode: this.currencyCode(),
        },
        merchantReference: input.reference,
        reasonForPayment: input.description,
        resultUrl: creds.resultUrl,
        returnUrl: creds.returnUrl,
      },
    );

    if (!transaction.referenceNumber || !transaction.redirectUrl) {
      throw new ServiceUnavailableException(
        transaction.transactionStatusDescription ?? 'Pesepay did not create a checkout',
      );
    }

    return {
      externalRef: transaction.referenceNumber,
      status: 'pending',
      checkoutUrl: transaction.redirectUrl,
      provider: 'pesepay',
    };
  }

  /**
   * Seamless payment: pushes a prompt straight to the customer's phone
   * instead of opening a browser
   * (developers.pesepay.com/api-reference/make-payment). The payment method
   * decides which fields are required — EcoCash wants `customerPhoneNumber`,
   * which is why the number is sent both on the customer and in the
   * required-fields bag.
   */
  private async createSeamlessCheckout(
    input: PaymentCheckoutInput & { phone: string },
    creds: PesepayCredentials,
  ): Promise<PaymentIntentResult> {
    const phone = toLocalPhone(input.phone);
    const transaction = await this.send<PesepayTransaction>(
      'POST',
      this.sandbox() ? SANDBOX_SEAMLESS_PATH : LIVE_SEAMLESS_PATH,
      creds,
      {
        amountDetails: {
          amount: toMajorUnits(input.amountUsdCents),
          currencyCode: this.currencyCode(),
        },
        merchantReference: input.reference,
        reasonForPayment: input.description,
        resultUrl: creds.resultUrl,
        returnUrl: creds.returnUrl,
        paymentMethodCode: this.config.get('PESEPAY_MOBILE_METHOD_CODE', { infer: true }),
        // Pesepay rejects a missing email outright, and this app never collects
        // one for a payer, so it goes out empty — the value its own client
        // libraries send.
        customer: { email: '', phoneNumber: phone, name: 'GUEST' },
        paymentMethodRequiredFields: { customerPhoneNumber: phone },
      },
    );

    const status = pesepayLedgerStatus(transaction.transactionStatus);
    if (status !== 'pending' || !transaction.referenceNumber) {
      const message =
        transaction.transactionStatusDescription ?? 'Pesepay did not accept the mobile checkout';
      if (DECLINE_STATUSES.has(transaction.transactionStatus?.toUpperCase() ?? '')) {
        throw new PesepayDeclinedError(message);
      }
      throw new ServiceUnavailableException(message);
    }

    return {
      externalRef: transaction.referenceNumber,
      status: 'pending',
      instructions:
        transaction.paymentMethodDetails?.paymentMethodMessage ??
        'Approve the payment prompt on your phone.',
      provider: 'pesepay',
    };
  }

  async pollStatus(externalRef: string): Promise<PaymentPollStatus> {
    const transaction = await this.checkPayment(externalRef, this.credentials());
    return pesepayLedgerStatus(transaction.transactionStatus);
  }

  /**
   * Pesepay does not sign its result callback, so nothing in the body can be
   * trusted on its own — see `confirmCallback`, which treats the body only as
   * a pointer and asks Pesepay itself what happened.
   */
  verifyCallback(): boolean {
    return false;
  }

  async confirmCallback(body: Record<string, unknown>): Promise<PaymentConfirmation> {
    const creds = this.credentials();
    const referenceNumber = this.readCallbackReference(body, creds);
    const transaction = await this.checkPayment(referenceNumber, creds);

    const merchantReference = transaction.merchantReference;
    const amount = transaction.amountDetails?.amount;
    if (!merchantReference || !transaction.referenceNumber || typeof amount !== 'number') {
      throw new ServiceUnavailableException('Pesepay returned an incomplete transaction');
    }
    // A transaction denominated in some other currency cannot be compared
    // against the cent amounts this app stores, so refuse rather than credit a
    // booking from an amount that does not mean what it looks like.
    if (transaction.amountDetails?.currencyCode !== this.currencyCode()) {
      throw new ServiceUnavailableException('Pesepay reported an unexpected currency');
    }

    return {
      reference: merchantReference,
      externalRef: transaction.referenceNumber,
      status: pesepayLedgerStatus(transaction.transactionStatus),
      amountUsdCents: Math.round(amount * 100),
    };
  }

  /**
   * The callback body says only *which* transaction moved. Pesepay sends it
   * encrypted like every other payload, but has also been seen posting it in
   * the clear, so both shapes are read.
   */
  private readCallbackReference(body: Record<string, unknown>, creds: PesepayCredentials): string {
    const decoded =
      typeof body.payload === 'string'
        ? (this.decrypt(body.payload, creds.encryptionKey) as PesepayTransaction)
        : (body as PesepayTransaction);
    const referenceNumber = decoded.referenceNumber;
    if (typeof referenceNumber !== 'string' || !referenceNumber) {
      throw new BadRequestException('Pesepay callback did not name a transaction');
    }
    return referenceNumber;
  }

  private checkPayment(
    referenceNumber: string,
    creds: PesepayCredentials,
  ): Promise<PesepayTransaction> {
    return this.send<PesepayTransaction>(
      'GET',
      `/v1/payments/check-payment?referenceNumber=${encodeURIComponent(referenceNumber)}`,
      creds,
    );
  }

  /** One request/response cycle: encrypt the body, send it, decrypt the reply. */
  private async send<T>(
    method: 'GET' | 'POST',
    path: string,
    creds: PesepayCredentials,
    requestBody?: unknown,
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl()}${path}`, {
        method,
        headers: {
          // The docs name `authorization`; Pesepay's own PHP client sends
          // `key`. Both go out because deployments have been seen accepting
          // only one — neither is a bearer token for anything else, so there
          // is nothing extra to leak by sending it twice.
          authorization: creds.integrationKey,
          key: creds.integrationKey,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        ...(requestBody === undefined
          ? {}
          : { body: JSON.stringify({ payload: this.encrypt(requestBody, creds.encryptionKey) }) }),
      });
    } catch {
      throw new ServiceUnavailableException('Pesepay could not be reached');
    }

    const text = await response.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new ServiceUnavailableException('Pesepay returned an unreadable response');
    }
    const envelope = parsed as { payload?: unknown; message?: unknown };

    if (!response.ok) {
      throw new ServiceUnavailableException(
        typeof envelope.message === 'string' ? envelope.message : 'Pesepay rejected the request',
      );
    }
    if (typeof envelope.payload !== 'string') {
      throw new ServiceUnavailableException(
        typeof envelope.message === 'string' ? envelope.message : 'Pesepay returned no payload',
      );
    }
    return this.decrypt(envelope.payload, creds.encryptionKey) as T;
  }

  private encrypt(body: unknown, encryptionKey: string): string {
    const cipher = createCipheriv('aes-256-cbc', encryptionKey, encryptionKey.slice(0, IV_LENGTH));
    return Buffer.concat([cipher.update(JSON.stringify(body), 'utf8'), cipher.final()]).toString(
      'base64',
    );
  }

  private decrypt(payload: string, encryptionKey: string): unknown {
    let plaintext: string;
    try {
      const decipher = createDecipheriv(
        'aes-256-cbc',
        encryptionKey,
        encryptionKey.slice(0, IV_LENGTH),
      );
      plaintext = Buffer.concat([
        decipher.update(Buffer.from(payload, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new ServiceUnavailableException('Pesepay returned an undecryptable payload');
    }
    try {
      return JSON.parse(plaintext);
    } catch {
      throw new ServiceUnavailableException('Pesepay returned an unreadable payload');
    }
  }

  private credentials(): PesepayCredentials {
    const integrationKey = this.config.get('PESEPAY_INTEGRATION_KEY', { infer: true });
    const encryptionKey = this.config.get('PESEPAY_ENCRYPTION_KEY', { infer: true });
    const returnUrl = this.config.get('PESEPAY_RETURN_URL', { infer: true });
    const resultUrl = this.config.get('PESEPAY_RESULT_URL', { infer: true });
    if (!integrationKey || !encryptionKey || !returnUrl || !resultUrl) {
      throw new ServiceUnavailableException('Pesepay is not configured');
    }
    return { integrationKey, encryptionKey, returnUrl, resultUrl };
  }

  private sandbox(): boolean {
    return this.config.get('PESEPAY_SANDBOX', { infer: true });
  }

  private baseUrl(): string {
    return this.sandbox() ? SANDBOX_BASE_URL : LIVE_BASE_URL;
  }

  private currencyCode(): string {
    return this.config.get('PESEPAY_CURRENCY_CODE', { infer: true });
  }
}

/** Pesepay amounts are decimal currency units; this app stores integer cents. */
function toMajorUnits(cents: number): number {
  return Number((cents / 100).toFixed(2));
}

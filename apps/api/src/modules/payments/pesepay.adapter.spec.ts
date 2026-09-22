import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../config/env';
import { PesepayAdapter, PesepayDeclinedError } from './pesepay.adapter';
import { pesepayLedgerStatus } from './pesepay-status';

const ENCRYPTION_KEY = 'abcdefghijklmnopqrstuvwxyz012345'; // AES-256 needs exactly 32 characters.

const PESEPAY_CONFIG = {
  PESEPAY_INTEGRATION_KEY: 'integration-key',
  PESEPAY_ENCRYPTION_KEY: ENCRYPTION_KEY,
  PESEPAY_RETURN_URL: 'https://example.com/return',
  PESEPAY_RESULT_URL: 'https://example.com/result',
  PESEPAY_SANDBOX: false,
  PESEPAY_CURRENCY_CODE: 'USD',
  PESEPAY_MOBILE_METHOD_CODE: 'PZW211',
} as const;

function createAdapter() {
  const config = {
    get: (key: keyof typeof PESEPAY_CONFIG) => PESEPAY_CONFIG[key],
  } as unknown as ConfigService<Env, true>;
  return new PesepayAdapter(config);
}

/** The same AES-256-CBC scheme the adapter uses, so a test can speak Pesepay's wire format. */
function encrypt(body: unknown): string {
  const cipher = createCipheriv('aes-256-cbc', ENCRYPTION_KEY, ENCRYPTION_KEY.slice(0, 16));
  return Buffer.concat([cipher.update(JSON.stringify(body), 'utf8'), cipher.final()]).toString(
    'base64',
  );
}

function decrypt(payload: string): unknown {
  const decipher = createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, ENCRYPTION_KEY.slice(0, 16));
  return JSON.parse(
    Buffer.concat([decipher.update(Buffer.from(payload, 'base64')), decipher.final()]).toString(
      'utf8',
    ),
  );
}

/** A Pesepay reply: the transaction, encrypted, inside a `payload` envelope. */
function reply(transaction: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ payload: encrypt(transaction) }), { status: 200 });
}

/** What the adapter actually put on the wire, decrypted back into an object. */
function sentBody(call: Parameters<typeof fetch> | undefined): Record<string, unknown> {
  const body = call?.[1]?.body;
  if (typeof body !== 'string') throw new Error('expected an encrypted JSON request body');
  return decrypt((JSON.parse(body) as { payload: string }).payload) as Record<string, unknown>;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PesepayAdapter seamless checkout', () => {
  it('encrypts the request and returns the prompt Pesepay sent to the phone', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      reply({
        referenceNumber: 'PSP-9001',
        transactionStatus: 'PENDING',
        paymentMethodDetails: { paymentMethodMessage: 'Dial *151# to approve.' },
      }),
    );

    const result = await createAdapter().createCheckout({
      reference: 'SO-1001',
      amountUsdCents: 1_250,
      description: 'Market order SO-1001',
      phone: '+263771234567',
    });

    expect(result).toEqual({
      externalRef: 'PSP-9001',
      status: 'pending',
      instructions: 'Dial *151# to approve.',
      provider: 'pesepay',
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://api.pesepay.com/api/payments-engine/v2/payments/make-payment',
    );
    // The E.164 number this app stores has to reach Pesepay as a local one.
    expect(sentBody(fetchMock.mock.calls[0])).toMatchObject({
      amountDetails: { amount: 12.5, currencyCode: 'USD' },
      merchantReference: 'SO-1001',
      paymentMethodCode: 'PZW211',
      customer: { phoneNumber: '0771234567' },
      paymentMethodRequiredFields: { customerPhoneNumber: '0771234567' },
    });
  });

  it('does not fall back to a hosted browser checkout when the phone prompt fails', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ message: 'That number is not registered' }), { status: 400 }),
      );

    await expect(
      createAdapter().createCheckout({
        reference: 'SO-1001',
        amountUsdCents: 1_250,
        description: 'Market order SO-1001',
        phone: '+263771234567',
        allowHostedCheckout: false,
      }),
    ).rejects.toThrow('That number is not registered');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refuses a declined payment instead of quietly opening a hosted checkout', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      reply({
        referenceNumber: 'PSP-9002',
        transactionStatus: 'INSUFFICIENT_FUNDS',
        transactionStatusDescription: 'Insufficient funds',
      }),
    );

    await expect(
      createAdapter().createCheckout({
        reference: 'BK-1001',
        amountUsdCents: 500,
        description: 'Booking BK-1001',
        phone: '+263771234567',
      }),
    ).rejects.toThrow(PesepayDeclinedError);

    // A decline is an answer, not a failed attempt: no second request.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to the hosted page when the method itself could not be used', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        reply({ referenceNumber: 'PSP-9003', transactionStatus: 'SERVICE_UNAVAILABLE' }),
      )
      .mockResolvedValueOnce(
        reply({
          referenceNumber: 'PSP-9004',
          transactionStatus: 'PENDING',
          redirectUrl: 'https://pay.pesepay.com/PSP-9004',
        }),
      );

    const result = await createAdapter().createCheckout({
      reference: 'BK-1002',
      amountUsdCents: 500,
      description: 'Booking BK-1002',
      phone: '+263771234567',
    });

    expect(result).toEqual({
      externalRef: 'PSP-9004',
      status: 'pending',
      checkoutUrl: 'https://pay.pesepay.com/PSP-9004',
      provider: 'pesepay',
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'https://api.pesepay.com/api/payments-engine/v1/payments/initiate',
    );
  });
});

describe('PesepayAdapter result callback', () => {
  it('takes the outcome from Pesepay, not from the unsigned callback body', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      reply({
        referenceNumber: 'PSP-9005',
        merchantReference: 'BK-1003',
        transactionStatus: 'FAILED',
        amountDetails: { amount: 5, currencyCode: 'USD' },
      }),
    );

    // The body claims the payment succeeded for a much larger amount.
    const confirmation = await createAdapter().confirmCallback({
      payload: encrypt({
        referenceNumber: 'PSP-9005',
        merchantReference: 'BK-1003',
        transactionStatus: 'SUCCESS',
        amountDetails: { amount: 5_000, currencyCode: 'USD' },
      }),
    });

    expect(confirmation).toEqual({
      reference: 'BK-1003',
      externalRef: 'PSP-9005',
      status: 'failed',
      amountUsdCents: 500,
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://api.pesepay.com/api/payments-engine/v1/payments/check-payment?referenceNumber=PSP-9005',
    );
  });

  it('reads a callback Pesepay posted in the clear', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      reply({
        referenceNumber: 'PSP-9006',
        merchantReference: 'BK-1004',
        transactionStatus: 'SUCCESS',
        amountDetails: { amount: 12.5, currencyCode: 'USD' },
      }),
    );

    await expect(createAdapter().confirmCallback({ referenceNumber: 'PSP-9006' })).resolves.toEqual(
      {
        reference: 'BK-1004',
        externalRef: 'PSP-9006',
        status: 'paid',
        amountUsdCents: 1_250,
      },
    );
  });

  it('refuses a transaction settled in another currency', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      reply({
        referenceNumber: 'PSP-9007',
        merchantReference: 'BK-1005',
        transactionStatus: 'SUCCESS',
        amountDetails: { amount: 12.5, currencyCode: 'ZWL' },
      }),
    );

    await expect(createAdapter().confirmCallback({ referenceNumber: 'PSP-9007' })).rejects.toThrow(
      'Pesepay reported an unexpected currency',
    );
  });

  it('never treats an unsigned body as proof on its own', () => {
    expect(createAdapter().verifyCallback()).toBe(false);
  });
});

describe('pesepayLedgerStatus', () => {
  it('maps Pesepay statuses onto the ledger', () => {
    expect(pesepayLedgerStatus('SUCCESS')).toBe('paid');
    expect(pesepayLedgerStatus('REVERSED')).toBe('refunded');
    expect(pesepayLedgerStatus('INSUFFICIENT_FUNDS')).toBe('failed');
    expect(pesepayLedgerStatus('CLOSED_PERIOD_ELAPSED')).toBe('failed');
    expect(pesepayLedgerStatus('PROCESSING')).toBe('pending');
    // Short of the full amount is not payment of it, and a status Pesepay adds
    // later must not void a booking that may still clear.
    expect(pesepayLedgerStatus('PARTIALLY_PAID')).toBe('pending');
    expect(pesepayLedgerStatus('SOMETHING_NEW')).toBe('pending');
    expect(pesepayLedgerStatus(undefined)).toBe('pending');
  });
});

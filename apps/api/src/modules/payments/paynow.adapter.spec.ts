import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../config/env';
import { PaynowAdapter } from './paynow.adapter';

const PAYNOW_CONFIG = {
  PAYNOW_INTEGRATION_ID: '1234',
  PAYNOW_INTEGRATION_KEY: 'secret',
  PAYNOW_RETURN_URL: 'https://example.com/return',
  PAYNOW_RESULT_URL: 'https://example.com/result',
  PAYNOW_AUTH_EMAIL: 'merchant@example.com',
} as const;

function createAdapter(overrides: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = { ...PAYNOW_CONFIG, ...overrides };
  const config = {
    get: (key: string) => values[key],
  } as unknown as ConfigService<Env, true>;
  return new PaynowAdapter(config);
}

/** A reply signed the way Paynow signs one: SHA-512 over every value in order, then the key. */
function signedReply(fields: [string, string][]): Response {
  const hash = createHash('sha512')
    .update(fields.map(([, value]) => value).join('') + PAYNOW_CONFIG.PAYNOW_INTEGRATION_KEY)
    .digest('hex')
    .toUpperCase();
  return new Response(new URLSearchParams([...fields, ['hash', hash]]).toString(), {
    status: 200,
  });
}

function sentBody(fetchMock: { mock: { calls: unknown[][] } }, call = 0): URLSearchParams {
  const init = fetchMock.mock.calls[call]?.[1] as RequestInit | undefined;
  return new URLSearchParams(init?.body as URLSearchParams);
}

const CHECKOUT = {
  reference: 'BK-1001',
  amountUsdCents: 1_500,
  description: 'Booking BK-1001',
  phone: '+263711234567',
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PaynowAdapter marketplace in-app checkout', () => {
  it('does not fall back to a hosted browser checkout when the phone prompt fails', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('status=Error&error=That+number+cannot+receive+an+EcoCash+prompt', {
        status: 200,
      }),
    );

    await expect(
      createAdapter().createCheckout({
        reference: 'SO-1001',
        amountUsdCents: 1_250,
        description: 'Market order SO-1001',
        phone: '+263771234567',
        allowHostedCheckout: false,
      }),
    ).rejects.toThrow('That number cannot receive an EcoCash prompt');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://www.paynow.co.zw/interface/remotetransaction',
    );
  });
});

describe('PaynowAdapter payment channels', () => {
  it('sends OneMoney as the Express Checkout method and returns a prompt', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      signedReply([
        ['status', 'Ok'],
        ['pollurl', 'https://www.paynow.co.zw/interface/checkpayment/?guid=abc'],
      ]),
    );

    const result = await createAdapter().createCheckout({ ...CHECKOUT, channel: 'onemoney' });

    expect(sentBody(fetchMock).get('method')).toBe('onemoney');
    expect(sentBody(fetchMock).get('phone')).toBe('0711234567');
    expect(result.instructions).toBe('Approve the OneMoney prompt on your phone.');
    expect(result.action).toBeUndefined();
  });

  it('returns the InnBucks authorisation code as an action', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      signedReply([
        ['status', 'Ok'],
        ['pollurl', 'https://www.paynow.co.zw/interface/checkpayment/?guid=abc'],
        ['authorizationcode', '123456789'],
        ['authorizationexpires', '20-Sep-2026 14:35'],
      ]),
    );

    const result = await createAdapter().createCheckout({ ...CHECKOUT, channel: 'innbucks' });

    expect(sentBody(fetchMock).get('method')).toBe('innbucks');
    expect(result.action).toEqual({
      kind: 'innbucks',
      authorizationCode: '123456789',
      expiresLabel: '20-Sep-2026 14:35',
    });
    expect(result.instructions).toContain('123456789');
  });

  it("starts O'mari's code step and keeps the OTP URL server-side", async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      signedReply([
        ['status', 'Ok'],
        ['pollurl', 'https://www.paynow.co.zw/interface/checkpayment/?guid=abc'],
        ['otpreference', 'OTP-42'],
        ['remoteotpurl', 'https://www.paynow.co.zw/interface/remoteotp/?guid=abc'],
      ]),
    );

    const result = await createAdapter().createCheckout({ ...CHECKOUT, channel: 'omari' });

    expect(result.action).toEqual({ kind: 'otp', otpReference: 'OTP-42' });
    expect(result.otpUrl).toBe('https://www.paynow.co.zw/interface/remoteotp/?guid=abc');
  });

  it('sends card payments straight to the hosted page without a phone prompt', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      signedReply([
        ['status', 'Ok'],
        ['browserurl', 'https://www.paynow.co.zw/payment/confirmtransaction/abc'],
        ['pollurl', 'https://www.paynow.co.zw/interface/checkpayment/?guid=abc'],
      ]),
    );

    const result = await createAdapter().createCheckout({ ...CHECKOUT, channel: 'card' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://www.paynow.co.zw/interface/initiatetransaction',
    );
    expect(result.checkoutUrl).toBe('https://www.paynow.co.zw/payment/confirmtransaction/abc');
  });

  it('refuses card where the hosted page is not allowed', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    await expect(
      createAdapter().createCheckout({
        ...CHECKOUT,
        channel: 'card',
        allowHostedCheckout: false,
      }),
    ).rejects.toThrow('Card payments are not available for this purchase');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a channel the PAYMENT_CHANNELS allow-list switched off', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    await expect(
      createAdapter({ PAYMENT_CHANNELS: ['ecocash', 'card'] }).createCheckout({
        ...CHECKOUT,
        channel: 'innbucks',
      }),
    ).rejects.toThrow("InnBucks isn't available right now");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("PaynowAdapter O'mari OTP", () => {
  const OTP_URL = 'https://www.paynow.co.zw/interface/remoteotp/?guid=abc';

  it('posts the code with a signed hash to the stored URL', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      signedReply([
        ['status', 'Paid'],
        ['reference', 'BK-1001'],
      ]),
    );

    await createAdapter().submitOtp(OTP_URL, '012345');

    expect(fetchMock.mock.calls[0]?.[0]).toBe(OTP_URL);
    const body = sentBody(fetchMock);
    expect(body.get('id')).toBe('1234');
    expect(body.get('otp')).toBe('012345');
    expect(body.get('status')).toBe('Message');
    const expected = createHash('sha512')
      .update('1234012345Message' + PAYNOW_CONFIG.PAYNOW_INTEGRATION_KEY)
      .digest('hex')
      .toUpperCase();
    expect(body.get('hash')).toBe(expected);
  });

  it('surfaces a wrong code as a 400', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('status=Error&error=Invalid+OTP', { status: 200 }),
    );
    await expect(createAdapter().submitOtp(OTP_URL, '000000')).rejects.toMatchObject({
      status: 400,
      message: 'Invalid OTP',
    });
  });

  it("never posts to a URL that is not Paynow's", async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    await expect(
      createAdapter().submitOtp('https://evil.example.com/otp', '012345'),
    ).rejects.toThrow('not a Paynow address');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

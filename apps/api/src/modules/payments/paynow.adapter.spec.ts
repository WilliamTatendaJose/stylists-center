import { ConfigService } from '@nestjs/config';
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

function createAdapter() {
  const config = {
    get: (key: keyof typeof PAYNOW_CONFIG) => PAYNOW_CONFIG[key],
  } as unknown as ConfigService<Env, true>;
  return new PaynowAdapter(config);
}

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

import { generateKeyPairSync, verify } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import type { Env } from '../../config/env';
import { AppStoreClient, decodeJwsPayload, fromApple } from './app-store.client';
import { fromPlay } from './google-play.client';
import { isEntitled } from './store-subscription';

const jws = (payload: object) =>
  `${Buffer.from('{"alg":"ES256"}').toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.sig`;

describe('fromPlay', () => {
  it('reads an active Play subscription', () => {
    const state = fromPlay('tok-1', {
      subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
      acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING',
      latestOrderId: 'GPA.1',
      externalAccountIdentifiers: { obfuscatedExternalAccountId: 'user-1' },
      lineItems: [
        {
          productId: 'agent_monthly',
          expiryTime: '2030-01-01T00:00:00Z',
          autoRenewingPlan: { autoRenewEnabled: true },
        },
      ],
    });
    expect(state).toMatchObject({
      externalId: 'tok-1',
      accountId: 'user-1',
      productId: 'agent_monthly',
      status: 'active',
      autoRenewing: true,
      needsAcknowledgement: true,
    });
    expect(isEntitled(state, new Date('2029-12-31T00:00:00Z'))).toBe(true);
  });

  it('keeps a cancelled-but-paid subscription entitled until it expires, and reads hold as no access', () => {
    const cancelled = fromPlay('t', {
      subscriptionState: 'SUBSCRIPTION_STATE_CANCELED',
      lineItems: [{ productId: 'p', expiryTime: '2030-01-01T00:00:00Z' }],
    });
    expect(isEntitled(cancelled, new Date('2029-01-01T00:00:00Z'))).toBe(true);
    expect(isEntitled(cancelled, new Date('2030-02-01T00:00:00Z'))).toBe(false);
    const hold = fromPlay('t', {
      subscriptionState: 'SUBSCRIPTION_STATE_ON_HOLD',
      lineItems: [{ productId: 'p', expiryTime: '2030-01-01T00:00:00Z' }],
    });
    expect(isEntitled(hold, new Date('2029-01-01T00:00:00Z'))).toBe(false);
  });
});

describe('fromApple', () => {
  const body = (status: number, tx: object) => ({
    data: [
      {
        lastTransactions: [
          {
            originalTransactionId: '1000',
            status,
            signedTransactionInfo: jws(tx),
            signedRenewalInfo: jws({ autoRenewStatus: 1 }),
          },
        ],
      },
    ],
  });

  it('reads an active subscription for the product', () => {
    const state = fromApple(
      body(1, {
        transactionId: '1002',
        originalTransactionId: '1000',
        productId: 'agent_monthly',
        expiresDate: Date.parse('2030-01-01T00:00:00Z'),
        appAccountToken: 'ABC-UUID',
      }),
      'agent_monthly',
    );
    expect(state).toMatchObject({
      externalId: '1000',
      accountId: 'abc-uuid',
      status: 'active',
      autoRenewing: true,
      latestOrderId: '1002',
    });
  });

  it('treats a revoked transaction as revoked and ignores other products', () => {
    const revoked = fromApple(
      body(1, { originalTransactionId: '1000', productId: 'agent_monthly', revocationDate: 1 }),
      'agent_monthly',
    );
    expect(revoked?.status).toBe('revoked');
    expect(fromApple(body(1, { productId: 'other' }), 'agent_monthly')).toBeNull();
  });

  it('decodes JWS payloads', () => {
    expect(decodeJwsPayload(jws({ a: 1 }))).toEqual({ a: 1 });
  });
});

describe('AppStoreClient.jwt', () => {
  it('signs an ES256 token Apple can verify with the key', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const client = new AppStoreClient(
      new ConfigService<Env, true>({
        APPLE_IAP_ISSUER_ID: 'issuer',
        APPLE_IAP_KEY_ID: 'KEY123',
        // As pasted into an env var: newlines escaped.
        APPLE_IAP_PRIVATE_KEY: pem.replace(/\n/g, '\\n'),
      }),
    );
    const token = client.jwt(1_800_000_000);
    const [header, payload, signature] = token.split('.') as [string, string, string];
    expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({
      alg: 'ES256',
      kid: 'KEY123',
      typ: 'JWT',
    });
    expect(JSON.parse(Buffer.from(payload, 'base64url').toString())).toMatchObject({
      iss: 'issuer',
      aud: 'appstoreconnect-v1',
      bid: 'zw.co.stylistscenter.app',
      exp: 1_800_000_600,
    });
    expect(
      verify(
        'sha256',
        Buffer.from(`${header}.${payload}`),
        { key: publicKey, dsaEncoding: 'ieee-p1363' },
        Buffer.from(signature, 'base64url'),
      ),
    ).toBe(true);
  });
});

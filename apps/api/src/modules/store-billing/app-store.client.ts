import { createPrivateKey, sign } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import {
  StoreNotConfiguredError,
  StorePurchaseNotFoundError,
  type StoreSubscriptionState,
  type StoreSubscriptionStatus,
} from './store-subscription';

const PRODUCTION = 'https://api.storekit.itunes.apple.com';
const SANDBOX = 'https://api.storekit-sandbox.itunes.apple.com';
const TIMEOUT_MS = 15_000;

/** A configured value, treating an empty or blank string as unset. */
export function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === '' ? undefined : trimmed;
}

/** Decodes a JWS payload without checking its signature. Exported for tests. */
export function decodeJwsPayload(jws: string): Record<string, unknown> {
  const part = jws.split('.')[1];
  if (!part) throw new Error('Not a JWS');
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>;
}

interface AppleTransaction {
  transactionId?: string;
  originalTransactionId?: string;
  productId?: string;
  expiresDate?: number;
  appAccountToken?: string;
  revocationDate?: number;
}

interface AppleRenewal {
  autoRenewStatus?: number;
}

/** The subset of Apple's "Get All Subscription Statuses" response this app reads. */
export interface AppleStatusResponse {
  data?: {
    lastTransactions?: {
      originalTransactionId?: string;
      status?: number;
      signedTransactionInfo?: string;
      signedRenewalInfo?: string;
    }[];
  }[];
}

// https://developer.apple.com/documentation/appstoreserverapi/status
const STATUSES: Record<number, StoreSubscriptionStatus> = {
  1: 'active',
  2: 'expired',
  3: 'on_hold',
  4: 'grace',
  5: 'revoked',
};

/**
 * Turns Apple's answer into the shared shape for `productId`. Exported for
 * tests. Returns null when the response has no such subscription.
 */
export function fromApple(
  body: AppleStatusResponse,
  productId: string,
): StoreSubscriptionState | null {
  for (const group of body.data ?? []) {
    for (const last of group.lastTransactions ?? []) {
      if (!last.signedTransactionInfo) continue;
      const tx = decodeJwsPayload(last.signedTransactionInfo) as AppleTransaction;
      if (tx.productId !== productId) continue;
      const renewal = last.signedRenewalInfo
        ? (decodeJwsPayload(last.signedRenewalInfo) as AppleRenewal)
        : {};
      return {
        platform: 'app_store',
        externalId: tx.originalTransactionId ?? last.originalTransactionId ?? '',
        accountId: tx.appAccountToken?.toLowerCase() ?? null,
        productId: tx.productId,
        expiresAt: tx.expiresDate ? new Date(tx.expiresDate) : null,
        status: tx.revocationDate ? 'revoked' : (STATUSES[last.status ?? 0] ?? 'expired'),
        autoRenewing: renewal.autoRenewStatus === 1,
        latestOrderId: tx.transactionId ?? null,
        linkedExternalId: null,
        needsAcknowledgement: false,
      };
    }
  }
  return null;
}

/**
 * Reads subscriptions with the App Store Server API. Answers fetched here,
 * over TLS with our own key, are what count: a transaction id from the app or
 * a server notification is only a pointer to look up.
 */
@Injectable()
export class AppStoreClient {
  constructor(private readonly config: ConfigService<Env, true>) {}

  get configured(): boolean {
    return (
      !!this.config.get('APPLE_IAP_ISSUER_ID', { infer: true }) &&
      !!this.config.get('APPLE_IAP_KEY_ID', { infer: true }) &&
      !!this.config.get('APPLE_IAP_PRIVATE_KEY', { infer: true })
    );
  }

  /**
   * Looks the transaction up in production, then in the sandbox (Apple's
   * recommended order: review and TestFlight purchases are sandbox ones).
   */
  async getSubscription(transactionId: string, productId: string): Promise<StoreSubscriptionState> {
    for (const host of [PRODUCTION, SANDBOX]) {
      const res = await fetch(
        `${host}/inApps/v1/subscriptions/${encodeURIComponent(transactionId)}`,
        {
          headers: { Authorization: `Bearer ${this.jwt()}` },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        },
      );
      if (res.status === 404) continue;
      if (!res.ok) throw new Error(`App Store answered ${String(res.status)}`);
      const state = fromApple((await res.json()) as AppleStatusResponse, productId);
      if (state) return state;
    }
    throw new StorePurchaseNotFoundError('The App Store does not recognise this purchase');
  }

  /** ES256 token for the App Store Server API (valid 10 minutes). Exported shape for tests. */
  jwt(now = Math.floor(Date.now() / 1000)): string {
    const issuer = this.config.get('APPLE_IAP_ISSUER_ID', { infer: true });
    const keyId = this.config.get('APPLE_IAP_KEY_ID', { infer: true });
    const pem = this.config.get('APPLE_IAP_PRIVATE_KEY', { infer: true })?.replace(/\\n/g, '\n');
    if (!issuer || !keyId || !pem)
      throw new StoreNotConfiguredError('App Store billing is not set up');
    const bundleId =
      nonEmpty(this.config.get('APPLE_BUNDLE_ID', { infer: true })) ?? 'zw.co.stylistscenter.app';
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const unsigned = `${encode({ alg: 'ES256', kid: keyId, typ: 'JWT' })}.${encode({
      iss: issuer,
      iat: now,
      exp: now + 600,
      aud: 'appstoreconnect-v1',
      bid: bundleId,
    })}`;
    const signature = sign('sha256', Buffer.from(unsigned), {
      key: createPrivateKey(pem),
      dsaEncoding: 'ieee-p1363',
    });
    return `${unsigned}.${signature.toString('base64url')}`;
  }
}

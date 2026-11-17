import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleAuth } from 'google-auth-library';
import type { Env } from '../../config/env';
import { nonEmpty } from './app-store.client';
import {
  StoreNotConfiguredError,
  StorePurchaseNotFoundError,
  type StoreSubscriptionState,
  type StoreSubscriptionStatus,
} from './store-subscription';

const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';
const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
const TIMEOUT_MS = 15_000;

/** The subset of Play's SubscriptionPurchaseV2 this app reads. */
export interface PlaySubscriptionV2 {
  subscriptionState?: string;
  acknowledgementState?: string;
  latestOrderId?: string;
  linkedPurchaseToken?: string;
  externalAccountIdentifiers?: { obfuscatedExternalAccountId?: string };
  lineItems?: {
    productId?: string;
    expiryTime?: string;
    autoRenewingPlan?: { autoRenewEnabled?: boolean };
  }[];
}

const STATES: Record<string, StoreSubscriptionStatus> = {
  SUBSCRIPTION_STATE_ACTIVE: 'active',
  // Cancelled = will not renew; still paid up until expiry.
  SUBSCRIPTION_STATE_CANCELED: 'active',
  SUBSCRIPTION_STATE_IN_GRACE_PERIOD: 'grace',
  SUBSCRIPTION_STATE_ON_HOLD: 'on_hold',
  SUBSCRIPTION_STATE_PAUSED: 'paused',
  SUBSCRIPTION_STATE_PENDING: 'pending',
  SUBSCRIPTION_STATE_EXPIRED: 'expired',
};

/** Turns Play's answer into the shared shape. Exported for tests. */
export function fromPlay(token: string, body: PlaySubscriptionV2): StoreSubscriptionState {
  const item = body.lineItems?.[0];
  const expiresAt = item?.expiryTime ? new Date(item.expiryTime) : null;
  return {
    platform: 'google_play',
    externalId: token,
    accountId: body.externalAccountIdentifiers?.obfuscatedExternalAccountId ?? null,
    productId: item?.productId ?? '',
    expiresAt: expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : null,
    status: STATES[body.subscriptionState ?? ''] ?? 'expired',
    autoRenewing: item?.autoRenewingPlan?.autoRenewEnabled ?? false,
    latestOrderId: body.latestOrderId ?? null,
    linkedExternalId: body.linkedPurchaseToken ?? null,
    needsAcknowledgement: body.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING',
  };
}

/**
 * Reads and acknowledges Play subscriptions with the Google Play Developer
 * API. Only answers from this API are trusted: a purchase token the app sends
 * (or a Pub/Sub notification) is just a pointer to look up here.
 */
@Injectable()
export class GooglePlayClient {
  private auth: GoogleAuth | null = null;

  constructor(private readonly config: ConfigService<Env, true>) {}

  get configured(): boolean {
    return !!this.config.get('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON', { infer: true })?.trim();
  }

  private get packageName(): string {
    return (
      nonEmpty(this.config.get('GOOGLE_PLAY_PACKAGE_NAME', { infer: true })) ??
      'zw.co.stylistscenter.app'
    );
  }

  async getSubscription(token: string): Promise<StoreSubscriptionState> {
    const res = await this.request(
      'GET',
      `${API}/${encodeURIComponent(this.packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(token)}`,
    );
    if (res.status === 404 || res.status === 410) {
      throw new StorePurchaseNotFoundError('Google Play does not recognise this purchase');
    }
    if (!res.ok) throw new Error(`Google Play answered ${String(res.status)}`);
    return fromPlay(token, (await res.json()) as PlaySubscriptionV2);
  }

  /** Must happen within 3 days of purchase, or Play refunds it. Idempotent. */
  async acknowledge(productId: string, token: string): Promise<void> {
    const res = await this.request(
      'POST',
      `${API}/${encodeURIComponent(this.packageName)}/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}:acknowledge`,
      {},
    );
    // 400 "already acknowledged" is the same outcome.
    if (!res.ok && res.status !== 400) {
      throw new Error(`Google Play acknowledge answered ${String(res.status)}`);
    }
  }

  private async request(method: 'GET' | 'POST', url: string, body?: unknown): Promise<Response> {
    const accessToken = await this.accessToken();
    return fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  }

  private async accessToken(): Promise<string> {
    const raw = this.config.get('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON', { infer: true })?.trim();
    if (!raw) throw new StoreNotConfiguredError('Google Play billing is not set up');
    this.auth ??= new GoogleAuth({
      credentials: JSON.parse(raw) as { client_email: string; private_key: string },
      scopes: [SCOPE],
    });
    const client = await this.auth.getClient();
    const { token } = await client.getAccessToken();
    if (!token) throw new Error('Google did not issue an access token');
    return token;
  }
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Updates from 'expo-updates';
import { useQueryClient } from '@tanstack/react-query';
import type { AgentSubscriptionDto, StorePurchaseInput } from '@sc/shared';
import { apiFetch } from '../api/client.js';
import { describeError } from '../api/errorMessage.js';

type Iap = typeof import('expo-iap');
type Purchase = Parameters<Iap['finishTransaction']>[0]['purchase'];

const ANDROID_PACKAGE = 'zw.co.stylistscenter.app';

/**
 * Whether this install sells the agent subscription through Google Play /
 * App Store billing: only the store build (production channel), only on a
 * phone, and only once staff switch it on in the console. Test builds keep
 * mobile money, so the subscription can still be paid during testing.
 */
export function storeBillingActive(storeBilling: 'on' | 'off'): boolean {
  return (
    storeBilling === 'on' &&
    (Platform.OS === 'android' || Platform.OS === 'ios') &&
    Updates.channel === 'production'
  );
}

/** The store gives a purchase token (Play) or transaction id (Apple) for the server to check. */
export function storeToken(purchase: { purchaseToken?: string | null; id: string }): string | null {
  return Platform.OS === 'android' ? (purchase.purchaseToken ?? null) : purchase.id;
}

export interface StoreSubscription {
  /** The store's price for the subscription, e.g. "$5.99", once loaded. */
  displayPrice: string | null;
  ready: boolean;
  busy: boolean;
  error: string | null;
  /** True once a purchase or restore was confirmed by the server. */
  done: boolean;
  subscribe: () => void;
  restore: () => void;
  manage: () => void;
}

/**
 * Buys, restores and manages the agent subscription through the store.
 * Every purchase is tagged with the user's id (so it can't be claimed by
 * another account) and only finished with the store after our server has
 * checked it with Google or Apple: an unfinished purchase is redelivered
 * next time, so nothing paid for is lost if the app closes mid-way.
 */
export function useStoreSubscription(
  enabled: boolean,
  productId: string,
  userId: string | null,
): StoreSubscription {
  const queryClient = useQueryClient();
  const iapRef = useRef<Iap | null>(null);
  const offerTokenRef = useRef<string | null>(null);
  const [displayPrice, setDisplayPrice] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const confirm = useCallback(
    async (purchase: Purchase) => {
      const iap = iapRef.current;
      const token = storeToken(purchase);
      if (!iap || !token || purchase.productId !== productId) return;
      const body: StorePurchaseInput = {
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
        productId,
        token,
      };
      await apiFetch<AgentSubscriptionDto>('/v1/wallet/agent-subscription/store-purchase', {
        method: 'POST',
        body,
      });
      await iap.finishTransaction({ purchase, isConsumable: false });
      void queryClient.invalidateQueries({ queryKey: ['wallet'] });
      setDone(true);
    },
    [productId, queryClient],
  );

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const subscriptions: { remove: () => void }[] = [];
    void (async () => {
      try {
        const iap = await import('expo-iap');
        if (cancelled) return;
        iapRef.current = iap;
        await iap.initConnection();
        subscriptions.push(
          iap.purchaseUpdatedListener((purchase) => {
            void confirm(purchase)
              .catch((reason: unknown) =>
                setError(
                  describeError(
                    reason,
                    "Your payment went through but couldn't be confirmed yet. Tap Restore purchase.",
                  ),
                ),
              )
              .finally(() => setBusy(false));
          }),
          iap.purchaseErrorListener((purchaseError) => {
            setBusy(false);
            if (String(purchaseError.code) === 'user-cancelled') return;
            setError(purchaseError.message || "The store couldn't complete the purchase.");
          }),
        );
        const products = await iap.fetchProducts({ skus: [productId], type: 'subs' });
        const product = (products ?? []).find((p) => p.id === productId) as
          | {
              displayPrice?: string;
              subscriptionOffers?: { offerTokenAndroid?: string | null }[] | null;
            }
          | undefined;
        if (cancelled) return;
        setDisplayPrice(product?.displayPrice ?? null);
        offerTokenRef.current = product?.subscriptionOffers?.[0]?.offerTokenAndroid ?? null;
        setReady(!!product);
        if (!product) setError("The subscription isn't available in the store yet.");
      } catch (reason) {
        if (!cancelled) setError(describeError(reason, "Couldn't reach the store. Try again."));
      }
    })();
    return () => {
      cancelled = true;
      subscriptions.forEach((s) => s.remove());
      void iapRef.current?.endConnection().catch(() => undefined);
    };
  }, [enabled, productId, confirm]);

  const subscribe = useCallback(() => {
    const iap = iapRef.current;
    if (!iap || !userId) return;
    setError(null);
    setBusy(true);
    const offerToken = offerTokenRef.current;
    void iap
      .requestPurchase({
        type: 'subs',
        request: {
          google: {
            skus: [productId],
            obfuscatedAccountId: userId,
            ...(offerToken ? { subscriptionOffers: [{ sku: productId, offerToken }] } : {}),
          },
          apple: { sku: productId, appAccountToken: userId },
        },
      })
      .catch((reason: unknown) => {
        setBusy(false);
        setError(describeError(reason, "The store couldn't start the purchase."));
      });
  }, [productId, userId]);

  const restore = useCallback(() => {
    const iap = iapRef.current;
    if (!iap) return;
    setError(null);
    setBusy(true);
    void (async () => {
      try {
        const purchases = await iap.getAvailablePurchases();
        const mine = purchases.filter((p) => p.productId === productId);
        if (mine.length === 0) {
          setError('No subscription to restore on this store account.');
          return;
        }
        for (const purchase of mine) await confirm(purchase);
      } catch (reason) {
        setError(describeError(reason, "Couldn't restore your subscription."));
      } finally {
        setBusy(false);
      }
    })();
  }, [productId, confirm]);

  const manage = useCallback(() => {
    void iapRef.current
      ?.deepLinkToSubscriptions({ packageNameAndroid: ANDROID_PACKAGE, skuAndroid: productId })
      .catch(() => undefined);
  }, [productId]);

  return { displayPrice, ready, busy, error, done, subscribe, restore, manage };
}

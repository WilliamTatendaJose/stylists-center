/**
 * One store subscription as Google Play or the App Store reports it, in a
 * shape the rest of the code can use without knowing which store it came from.
 */
export type StoreSubscriptionStatus =
  /** Paid and renewing (or paid and set not to renew: still entitled until it expires). */
  | 'active'
  /** Renewal payment failed; the store keeps access on for a grace period. */
  | 'grace'
  /** Renewal payment failed and the grace period is over; no access. */
  | 'on_hold'
  | 'paused'
  /** Not yet paid (e.g. a pending cash payment in Play). */
  | 'pending'
  | 'expired'
  /** Refunded or revoked by the store; access ends now. */
  | 'revoked';

export interface StoreSubscriptionState {
  platform: 'google_play' | 'app_store';
  /** Stable id of the subscription: Play purchase token / Apple original transaction id. */
  externalId: string;
  /** The id this app attached at purchase time (our user id), when the store returns it. */
  accountId: string | null;
  productId: string;
  expiresAt: Date | null;
  status: StoreSubscriptionStatus;
  autoRenewing: boolean;
  /** Latest order (Play) or transaction (Apple), for the record. */
  latestOrderId: string | null;
  /** Play: the purchase this one replaced (upgrade or resubscribe), if any. */
  linkedExternalId: string | null;
  /** Play only: the purchase still has to be acknowledged within 3 days or it is refunded. */
  needsAcknowledgement: boolean;
}

/** Whether the subscription gives access right now. */
export function isEntitled(state: StoreSubscriptionState, now = new Date()): boolean {
  return (
    (state.status === 'active' || state.status === 'grace') &&
    state.expiresAt !== null &&
    state.expiresAt.getTime() > now.getTime()
  );
}

/** Raised when a store is not configured on this server. */
export class StoreNotConfiguredError extends Error {}

/** Raised when the store does not recognise the purchase. */
export class StorePurchaseNotFoundError extends Error {}

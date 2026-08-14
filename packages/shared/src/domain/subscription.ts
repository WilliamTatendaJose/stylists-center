/**
 * Provider monthly subscription (replaces the old 5% per-payment platform
 * fee — a provider now keeps the full amount of every booking/order and
 * instead pays a flat recurring fee for the right to appear in search and
 * smart-match). `DEFAULT_SUBSCRIPTION_PRICE_USD_CENTS` is the only price
 * that exists today; it's a per-provider column (`subscriptionPriceUsdCents`)
 * rather than a shared constant so a future admin webapp can change one
 * provider's price without a deploy, it just has nothing to set it to yet.
 */
export const DEFAULT_SUBSCRIPTION_PRICE_USD_CENTS = 500;

/** A payment extends `subscriptionPaidUntil` by exactly this many days from whichever is later: today, or the current expiry (so paying early never loses time already paid for). */
export const SUBSCRIPTION_CYCLE_DAYS = 30;

/**
 * Whether a provider's subscription currently covers today. `paidUntil` is
 * `null` for a provider who has never paid — never active, not an error.
 */
export function isSubscriptionActive(paidUntil: string | null, now: number = Date.now()): boolean {
  if (!paidUntil) return false;
  return new Date(paidUntil).getTime() > now;
}

/**
 * The date a payment made `now` should extend `subscriptionPaidUntil` to.
 * Starts from the later of `now` or the current `paidUntil` so a provider
 * who pays a few days early keeps the unused days rather than losing them.
 */
export function nextSubscriptionPaidUntil(
  currentPaidUntil: string | null,
  now: number = Date.now(),
): string {
  const current = currentPaidUntil ? new Date(currentPaidUntil).getTime() : 0;
  const base = Math.max(current, now);
  return new Date(base + SUBSCRIPTION_CYCLE_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

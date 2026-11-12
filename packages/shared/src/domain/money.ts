/**
 * Money and SC Coins (SRS §3.9, §3.10).
 *
 * All money is integer USD cents, everywhere, on both sides of the wire.
 * Floating point USD dollars is exactly the kind of thing that produces a
 * booking total that's off by a cent after a few operations — cents avoid the
 * whole category of bug.
 */
export type UsdCents = number;

/** The current cash value of one SC Coin: $0.20. */
export const COIN_USD_CENTS = 20;

/** Coins released to the referring agent after a referred user's first completed booking. */
export const REFERRAL_REWARD_COINS = 6;

/** Cash-out unlocks once the wallet balance EXCEEDS $5 — 500 is not enough, 501 is. */
export const CASH_OUT_MIN_USD_CENTS = 500;

export function coinsToUsdCents(coins: number, coinUsdCents: number = COIN_USD_CENTS): UsdCents {
  return coins * coinUsdCents;
}

/**
 * Whole coins a USD amount converts to, rounded down — an agent is never
 * credited a fractional coin they didn't fully earn.
 */
export function usdCentsToCoins(
  amountCents: UsdCents,
  coinUsdCents: number = COIN_USD_CENTS,
): number {
  return Math.floor(amountCents / coinUsdCents);
}

export function canCashOut(
  balanceCents: UsdCents,
  minimumCents: UsdCents = CASH_OUT_MIN_USD_CENTS,
): boolean {
  return balanceCents > minimumCents;
}

export function formatUsd(cents: UsdCents): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const remainder = abs % 100;
  return `${sign}$${dollars.toString()}.${remainder.toString().padStart(2, '0')}`;
}

/**
 * When the next cash-out is allowed, given the last request. Null when one
 * can be made now (never cashed out, or the interval has passed).
 */
export function nextCashOutAt(
  lastRequestedAt: Date | null,
  intervalDays: number,
  now: Date = new Date(),
): Date | null {
  if (!lastRequestedAt || intervalDays <= 0) return null;
  const next = new Date(lastRequestedAt.getTime() + intervalDays * 24 * 60 * 60 * 1000);
  return next.getTime() > now.getTime() ? next : null;
}

/**
 * Coins that pay for an amount outright, rounded up so the coins always
 * cover it: a $5.00 haircut at 10c a coin is 50 coins, $5.05 is 51.
 */
export function coinsToCover(amountCents: UsdCents, coinUsdCents: number): number {
  if (amountCents <= 0 || coinUsdCents <= 0) return 0;
  return Math.ceil(amountCents / coinUsdCents);
}

/** "or 50 coins" — the coin price shown next to a cash price. */
export function formatCoinPrice(amountCents: UsdCents, coinUsdCents: number): string {
  const coins = coinsToCover(amountCents, coinUsdCents);
  return coins > 0 ? `or ${String(coins)} coins` : '';
}

/**
 * Coins pay for a whole service or product, never part of it: the coins
 * the client must spend to use coins at all, or 0 when they don't have
 * enough (they pay in cash instead). Rounded up, so the coins always cover
 * the amount.
 */
export function coinsToPayInFull(
  amountCents: UsdCents,
  coinUsdCents: number,
  availableCoins: number,
): number {
  const needed = coinsToCover(amountCents, coinUsdCents);
  return needed > 0 && availableCoins >= needed ? needed : 0;
}

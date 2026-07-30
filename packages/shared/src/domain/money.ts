/**
 * Money and SC Coins (SRS §3.9, §3.10).
 *
 * All money is integer USD cents, everywhere, on both sides of the wire.
 * Floating point USD dollars is exactly the kind of thing that produces a
 * booking total that's off by a cent after a few operations — cents avoid the
 * whole category of bug.
 */
export type UsdCents = number;

/** 5% platform fee on in-app service payments and in-app product sales. Cash is untouched. */
export const PLATFORM_FEE_BPS = 500;

/** 1 SC Coin = $0.50. */
export const COIN_USD_CENTS = 50;

/** Cash-out unlocks once the wallet balance EXCEEDS $5 — 500 is not enough, 501 is. */
export const CASH_OUT_MIN_USD_CENTS = 500;

/**
 * Rounds half up, in cents. Bankers' rounding would be defensible too, but
 * half-up is simpler to explain in a support conversation about why a fee was
 * $0.01 different from a naive calculation, and it matches how EcoCash and
 * most payment processors round.
 */
function roundCents(cents: number): number {
  return Math.round(cents);
}

/** The platform's cut of an in-app payment, in cents. */
export function platformFeeCents(amountCents: UsdCents): UsdCents {
  return roundCents((amountCents * PLATFORM_FEE_BPS) / 10_000);
}

/** What the provider/seller actually receives after the platform fee. */
export function netOfFeeCents(amountCents: UsdCents): UsdCents {
  return amountCents - platformFeeCents(amountCents);
}

export function coinsToUsdCents(coins: number): UsdCents {
  return coins * COIN_USD_CENTS;
}

/**
 * Whole coins a USD amount converts to, rounded down — an agent is never
 * credited a fractional coin they didn't fully earn.
 */
export function usdCentsToCoins(amountCents: UsdCents): number {
  return Math.floor(amountCents / COIN_USD_CENTS);
}

export function canCashOut(balanceCents: UsdCents): boolean {
  return balanceCents > CASH_OUT_MIN_USD_CENTS;
}

export function formatUsd(cents: UsdCents): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const remainder = abs % 100;
  return `${sign}$${dollars.toString()}.${remainder.toString().padStart(2, '0')}`;
}

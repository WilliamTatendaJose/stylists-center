/**
 * StylistsCenter's fees (requirements sign-off, Q1 and Q12). Clients pay
 * stylists and vendors directly; the app records what each owes.
 *
 * - Booking: the service fee is ADDED to the stylist's price for the client
 *   ($20 job at 3% shows $20.60); the stylist owes the $0.60.
 * - Marketplace: the vendor owes the commission on the product total,
 *   excluding any delivery charge.
 *
 * Rates are settings in basis points (serviceFeeBps, marketplaceFeeBps).
 */

/** `amountCents * bps / 10000`, rounded half up to a whole cent. */
export function feeCents(amountCents: number, bps: number): number {
  if (amountCents <= 0 || bps <= 0) return 0;
  return Math.floor((amountCents * bps + 5_000) / 10_000);
}

/** Who carries the booking service fee (setting serviceFeePaidBy). */
export type ServiceFeePayer = 'client' | 'stylist';

/**
 * What the client sees and pays the stylist for a booking: the price plus
 * the service fee when the client pays it, or just the price when the
 * stylist does. The fee itself is the same either way.
 */
export function clientTotalCents(
  priceCents: number,
  serviceFeeBps: number,
  paidBy: ServiceFeePayer = 'client',
): number {
  return priceCents + (paidBy === 'client' ? feeCents(priceCents, serviceFeeBps) : 0);
}

/** Whole reward coins for an amount spent: $10 per coin by default, rounded down. */
export function rewardCoinsForSpend(spentCents: number, spendUsdPerCoin: number): number {
  if (spentCents <= 0 || spendUsdPerCoin <= 0) return 0;
  return Math.floor(spentCents / (spendUsdPerCoin * 100));
}

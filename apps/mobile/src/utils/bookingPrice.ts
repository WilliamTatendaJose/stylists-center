import {
  clientTotalCents,
  feeCents,
  formatUsd,
  maxCoinsForBooking,
  type ServiceFeePayer,
} from '@sc/shared';

/**
 * What a client is shown for a service. When the client pays the service fee
 * (setting serviceFeePaidBy) it is added and named, so the extra amount is
 * never a surprise; when the stylist carries it, the client sees the listed
 * price and `feeUsdCents` is 0.
 */
export function clientPrice(
  priceUsdCents: number,
  serviceFeeBps: number,
  paidBy: ServiceFeePayer = 'client',
) {
  return {
    feeUsdCents: paidBy === 'client' ? feeCents(priceUsdCents, serviceFeeBps) : 0,
    totalUsdCents: clientTotalCents(priceUsdCents, serviceFeeBps, paidBy),
  };
}

/** "$20.60 (includes $0.60 service fee)"; just the price when the client pays no fee. */
export function formatClientPrice(
  priceUsdCents: number,
  serviceFeeBps: number,
  paidBy: ServiceFeePayer = 'client',
): string {
  const { feeUsdCents, totalUsdCents } = clientPrice(priceUsdCents, serviceFeeBps, paidBy);
  return feeUsdCents > 0
    ? `${formatUsd(totalUsdCents)} (includes ${formatUsd(feeUsdCents)} service fee)`
    : formatUsd(totalUsdCents);
}

/**
 * Coins a client can put towards a booking: everything they have, but never
 * more than the booking is worth. The server enforces the same cap.
 */
export function coinsToApply(
  walletCoins: number,
  totalUsdCents: number,
  coinUsdCents: number,
): number {
  return Math.max(0, Math.min(walletCoins, maxCoinsForBooking(totalUsdCents, coinUsdCents)));
}

import { clientTotalCents, feeCents, formatUsd, maxCoinsForBooking } from '@sc/shared';

/**
 * What a client is shown for a service: the stylist's price plus the service
 * fee, with the fee named so the extra amount is never a surprise.
 */
export function clientPrice(priceUsdCents: number, serviceFeeBps: number) {
  const feeUsdCents = feeCents(priceUsdCents, serviceFeeBps);
  return {
    feeUsdCents,
    totalUsdCents: clientTotalCents(priceUsdCents, serviceFeeBps),
  };
}

/** "$20.60 (includes $0.60 service fee)"; just the price when there is no fee. */
export function formatClientPrice(priceUsdCents: number, serviceFeeBps: number): string {
  const { feeUsdCents, totalUsdCents } = clientPrice(priceUsdCents, serviceFeeBps);
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

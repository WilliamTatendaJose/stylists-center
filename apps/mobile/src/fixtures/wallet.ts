import type { ReferralRowDto, WalletDto } from '@sc/shared';
import { CASH_OUT_MIN_USD_CENTS, canCashOut, coinsToUsdCents, COIN_USD_CENTS } from '@sc/shared';

/** Matches the handoff's wallet screen exactly: 14 coins = $7.00, code SC-TARI7. */
const COINS = 14;

export const WALLET: WalletDto = {
  coins: COINS,
  usdCents: coinsToUsdCents(COINS),
  coinUsdCents: COIN_USD_CENTS,
  referralCode: 'SC-TARI7',
  canCashOut: canCashOut(coinsToUsdCents(COINS)),
  cashOutMinUsdCents: CASH_OUT_MIN_USD_CENTS,
  isVerifiedAgent: true,
};

export const REFERRAL_ROWS: ReferralRowDto[] = [
  { id: 'ref-1', referredName: "Kudzai's Kutz", coins: 6, status: 'paid' },
  { id: 'ref-2', referredName: 'Nyasha Beauty Bar', coins: 6, status: 'paid' },
  { id: 'ref-3', referredName: 'R. Moyo', coins: 2, status: 'pending' },
];

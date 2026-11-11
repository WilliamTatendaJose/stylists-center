import { describe, expect, it } from 'vitest';
import { SettingsService } from '../modules/settings/settings.service';
import { walletRates } from './wallet-rates';

describe('walletRates', () => {
  it('uses the shared defaults when nothing is configured', async () => {
    expect(await walletRates(new SettingsService(undefined, {}))).toEqual({
      coinUsdCents: 20,
      referralRewardCoins: 6,
      cashOutMinUsdCents: 500,
    });
  });

  it('uses environment values when they are set', async () => {
    const settings = new SettingsService(undefined, {
      COIN_USD_CENTS: '75',
      REFERRAL_REWARD_COINS: '10',
      CASH_OUT_MIN_USD_CENTS: '1000',
    });
    expect(await walletRates(settings)).toEqual({
      coinUsdCents: 75,
      referralRewardCoins: 10,
      cashOutMinUsdCents: 1000,
    });
  });

  it('ignores an out-of-range environment value and falls back to the default', async () => {
    const settings = new SettingsService(undefined, { COIN_USD_CENTS: '-3' });
    expect((await walletRates(settings)).coinUsdCents).toBe(20);
  });
});

import { SettingsService } from '../modules/settings/settings.service';

/** Env-and-defaults only, for services built by hand without the settings module. */
const fallbackSettings = new SettingsService();

/**
 * Wallet rates in effect now: console value, else environment variable, else
 * default (see SETTING_DEFINITIONS in @sc/shared).
 */
export async function walletRates(settings?: SettingsService) {
  const s = await (settings ?? fallbackSettings).all();
  return {
    coinUsdCents: s.coinUsdCents,
    referralRewardCoins: s.referralRewardCoins,
    cashOutMinUsdCents: s.cashOutMinUsdCents,
    cashOutIntervalDays: s.cashOutIntervalDays,
    cashOutPayoutDays: s.cashOutPayoutDays,
    subscriptionPriceUsdCents: s.subscriptionPriceUsdCents,
    subscriptionCycleDays: s.subscriptionCycleDays,
  };
}

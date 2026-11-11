import { describe, expect, it } from 'vitest';
import {
  checkSettingsConsistency,
  defaultSettings,
  isBudgetAmountAllowed,
  parseSettingValue,
  SETTING_DEFINITIONS,
  SETTING_KEYS,
  snapBudgetAmount,
} from './settings.js';
import { BUDGET_MAX_USD, BUDGET_MIN_USD, BUDGET_STEP_USD, isValidBudgetAmount } from './budget.js';

describe('settings registry', () => {
  it('every setting has its own environment variable', () => {
    const envs = SETTING_KEYS.map((key) => SETTING_DEFINITIONS[key].env);
    expect(new Set(envs).size).toBe(envs.length);
  });

  it('every default is itself a valid value', () => {
    const defaults = defaultSettings();
    for (const key of SETTING_KEYS) {
      expect(parseSettingValue(key, defaults[key]), key).toEqual({
        ok: true,
        value: defaults[key],
      });
    }
    expect(checkSettingsConsistency(defaults)).toBeNull();
  });

  it('parses environment strings and rejects out-of-range or fractional values', () => {
    expect(parseSettingValue('coinUsdCents', '10')).toEqual({ ok: true, value: 10 });
    expect(parseSettingValue('coinUsdCents', '0').ok).toBe(false);
    expect(parseSettingValue('coinUsdCents', '2.5').ok).toBe(false);
    expect(parseSettingValue('coinUsdCents', 'ten').ok).toBe(false);
    expect(parseSettingValue('supportEmail', '  help@example.com ')).toEqual({
      ok: true,
      value: 'help@example.com',
    });
    expect(parseSettingValue('supportEmail', 5).ok).toBe(false);
    expect(parseSettingValue('supportHours', 'x'.repeat(500)).ok).toBe(false);
  });
});

describe('budget settings', () => {
  it('with default settings, allows exactly what the old fixed rule allowed', () => {
    const defaults = defaultSettings();
    for (let usd = 0; usd <= 130; usd++) {
      expect(isBudgetAmountAllowed(usd, defaults), String(usd)).toBe(isValidBudgetAmount(usd));
    }
    expect([defaults.budgetMinUsd, defaults.budgetMaxUsd, defaults.budgetStepUsd]).toEqual([
      BUDGET_MIN_USD,
      BUDGET_MAX_USD,
      BUDGET_STEP_USD,
    ]);
  });

  it('follows a changed range', () => {
    const custom = { ...defaultSettings(), budgetMinUsd: 20, budgetMaxUsd: 200, budgetStepUsd: 20 };
    expect(isBudgetAmountAllowed(200, custom)).toBe(true);
    expect(isBudgetAmountAllowed(10, custom)).toBe(false);
    expect(isBudgetAmountAllowed(30, custom)).toBe(false);
  });

  it('snaps a slider value onto the current range and step', () => {
    const custom = { ...defaultSettings(), budgetMinUsd: 20, budgetMaxUsd: 60, budgetStepUsd: 10 };
    expect(snapBudgetAmount(50, custom)).toBe(50);
    expect(snapBudgetAmount(5, custom)).toBe(20);
    expect(snapBudgetAmount(500, custom)).toBe(60);
    expect(snapBudgetAmount(34, custom)).toBe(30);
  });

  it('refuses a range the slider could not show', () => {
    expect(
      checkSettingsConsistency({ ...defaultSettings(), budgetMinUsd: 200, budgetMaxUsd: 100 }),
    ).toMatch(/cannot be above/);
    expect(checkSettingsConsistency({ ...defaultSettings(), budgetStepUsd: 7 })).toMatch(
      /divide evenly/,
    );
  });
});

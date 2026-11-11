import { describe, expect, it } from 'vitest';
import { displaySetting, fromInput } from '../routes/SettingsPage';

describe('settings input', () => {
  it('money stored in cents is entered and shown in dollars', () => {
    expect(fromInput('cents', '5.00')).toEqual({ ok: true, value: 500 });
    expect(fromInput('cents', '$0.10')).toEqual({ ok: true, value: 10 });
    expect(fromInput('cents', '7')).toEqual({ ok: true, value: 700 });
    expect(fromInput('cents', '1.234').ok).toBe(false);
    expect(displaySetting('cents', 500)).toBe('$5.00');
  });

  it('whole-number settings refuse fractions and text', () => {
    expect(fromInput('days', '30')).toEqual({ ok: true, value: 30 });
    expect(fromInput('coins', '2.5').ok).toBe(false);
    expect(fromInput('usd', 'ten').ok).toBe(false);
    expect(displaySetting('usd', 10)).toBe('$10.00');
    expect(displaySetting('coins', 1)).toBe('1 coin');
  });

  it('text is trimmed, and empty text reads as not set', () => {
    expect(fromInput('text', '  help@example.com ')).toEqual({
      ok: true,
      value: 'help@example.com',
    });
    expect(displaySetting('text', '')).toBe('Not set');
  });
});

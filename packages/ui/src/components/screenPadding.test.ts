import { describe, expect, it } from 'vitest';
import {
  resolveHeaderTopPadding,
  resolveFooterBottomPadding,
  resolveTabBarBottomPadding,
} from './screenPadding.js';
import { layout } from '@sc/tokens';

describe('resolveHeaderTopPadding', () => {
  it('uses the design value on a device with a small safe-area inset', () => {
    // A device with e.g. a 24px status bar and no notch.
    expect(resolveHeaderTopPadding(24)).toBe(layout.headerTop);
  });

  it('grows past the design value on a device with a large inset (Dynamic Island class)', () => {
    const inset = 59; // measured, larger than the reference device's
    const result = resolveHeaderTopPadding(inset);
    expect(result).toBeGreaterThan(layout.headerTop);
    expect(result).toBeGreaterThanOrEqual(inset);
  });

  it('never returns less than the safe area inset itself, whatever the design value says', () => {
    expect(resolveHeaderTopPadding(100)).toBeGreaterThanOrEqual(100);
  });
});

describe('resolveFooterBottomPadding', () => {
  it('uses the design value on a device with a small home-indicator inset', () => {
    expect(resolveFooterBottomPadding(0)).toBe(layout.footerBottom); // Android 3-button nav
  });

  it('grows past the design value on a device with a tall home indicator inset', () => {
    const inset = 34;
    const result = resolveFooterBottomPadding(inset);
    expect(result).toBeGreaterThanOrEqual(inset);
  });
});

describe('resolveTabBarBottomPadding', () => {
  it('is a fixed reservation regardless of device', () => {
    expect(resolveTabBarBottomPadding()).toBe(layout.tabBarInset);
  });
});

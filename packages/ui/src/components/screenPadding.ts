import { layout, space } from '@sc/tokens';

/**
 * The handoff's 56px header / 42px footer padding was measured on a single
 * reference device (402x874, iPhone 14 Pro class) and already bakes in that
 * device's status bar and home indicator. A Dynamic Island phone, an Android
 * phone with 3-button nav, or a tablet all have different real safe-area
 * insets, so using the fixed number verbatim would clip content on some
 * devices and look overly padded on others.
 *
 * The rule: take whichever is LARGER — the design's fixed value (protects the
 * intended visual rhythm on ordinary devices) or the device's actual safe
 * area plus a small breathing-room gap (protects against clipping under a
 * notch or home indicator this app has never been tuned for). Pure functions
 * so the rule itself is unit-testable without a React Native renderer.
 */
export function resolveHeaderTopPadding(safeAreaInsetTop: number): number {
  return Math.max(layout.headerTop, safeAreaInsetTop + space.xxl);
}

export function resolveFooterBottomPadding(safeAreaInsetBottom: number): number {
  return Math.max(layout.footerBottom, safeAreaInsetBottom + space.l);
}

/**
 * A screen with the floating tab bar reserves 104px so its last row isn't
 * hidden behind it (layout.tabBarInset) — that reservation already clears the
 * home indicator on every device the tab bar itself was designed against, so
 * unlike the footer case above it does not need a safe-area top-up.
 */
export function resolveTabBarBottomPadding(): number {
  return layout.tabBarInset;
}

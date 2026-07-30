/** The design's vertical rhythm: 6 / 8 / 10 / 12 / 14 / 16 / 18 / 20 / 22. */
export const space = {
  xs: 6,
  sm: 8,
  s: 10,
  m: 12,
  ml: 14,
  l: 16,
  xl: 18,
  xxl: 20,
  xxxl: 22,
} as const;

export type SpaceToken = keyof typeof space;

export const layout = {
  /** Horizontal screen padding. Every screen, no exceptions. */
  screenX: 20,
  /** Header top padding, clearing the status bar. */
  headerTop: 56,
  /** Footer bottom padding, clearing the home indicator. */
  footerBottom: 42,
  /**
   * Bottom padding a tabbed screen must reserve so its last row is not hidden
   * behind the floating nav bar.
   */
  tabBarInset: 104,
  /** Gap between section blocks. */
  section: 20,
  /** Floating nav bar geometry. */
  tabBarSideInset: 14,
  tabBarBottomInset: 24,
  tabBarPadding: 5,
  tabBarGap: 2,
  tabHeight: 44,
  /** No tappable control is smaller than this in either axis. */
  minTouchTarget: 44,
} as const;

export const radius = {
  /** Pills, buttons, inputs. */
  pill: 999,
  /** Cards. */
  card: 20,
  /** Tiles and stat cards. */
  tile: 18,
  /** List thumbnails. */
  thumb: 16,
  /** Hero images. */
  hero: 24,
  /** Bottom sheets — top corners only. */
  sheet: 24,
} as const;

export type RadiusToken = keyof typeof radius;

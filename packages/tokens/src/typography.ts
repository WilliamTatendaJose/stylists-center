/**
 * Typography tokens.
 *
 * Each entry is a complete, ready-to-spread React Native TextStyle. Callers
 * never pick a font size, weight or letter spacing themselves — that is what
 * keeps the type scale honest across 28 screens.
 *
 * Three RN-specific conversions are baked in at definition time:
 *
 * 1. `fontWeight: '800'` does not work with a custom font on Android. The
 *    weight lives in the family name (`Archivo_800ExtraBold`), so weight is
 *    never set as a style property anywhere in this codebase.
 *
 * 2. `letterSpacing` is em in CSS but absolute points in RN. Every value below
 *    is already multiplied out (e.g. -0.03em at 54px = -1.62).
 *
 * 3. `lineHeight` is a unitless multiplier in CSS and points in RN, so the
 *    handoff's ratios are resolved against each size.
 *
 * Where the handoff gave a range ("38-40px", "12.5-15px") it is collapsed to a
 * single value. One value means one look; if a screen genuinely needs the other
 * end of a range, that is a new named token rather than a local override.
 */

export const fontFamily = {
  heading: 'Archivo_800ExtraBold',
  body: 'Archivo_400Regular',
  bodyStrong: 'Archivo_600SemiBold',
} as const;

/** Loaded by expo-font at startup; keys must match `fontFamily` values. */
export const fontAssets = [
  'Archivo_400Regular',
  'Archivo_600SemiBold',
  'Archivo_800ExtraBold',
] as const;

export const type = {
  /** Full-screen hero: "Booked.", "Ordered." */
  hero: {
    fontFamily: fontFamily.heading,
    fontSize: 40,
    lineHeight: 40,
    letterSpacing: -0.8,
  },
  /** Page heading. */
  h2: {
    fontFamily: fontFamily.heading,
    fontSize: 30,
    lineHeight: 32,
  },
  /** Smaller page heading, used on the expired / trip screens. */
  h2Small: {
    fontFamily: fontFamily.heading,
    fontSize: 27,
    lineHeight: 29,
  },
  /** Profile name. */
  h3: {
    fontFamily: fontFamily.heading,
    fontSize: 22,
    lineHeight: 24,
  },
  /** Screen title in a header bar. */
  h4: {
    fontFamily: fontFamily.heading,
    fontSize: 16,
    lineHeight: 19,
  },
  /** Tab-level screen title ("Bookings", "Agent wallet"). */
  h4Large: {
    fontFamily: fontFamily.heading,
    fontSize: 19,
    lineHeight: 22,
  },
  /** The wordmark. */
  wordmark: {
    fontFamily: fontFamily.heading,
    fontSize: 19,
    lineHeight: 22,
    letterSpacing: -0.38,
  },
  /** Smart-match countdown. */
  countdown: {
    fontFamily: fontFamily.heading,
    fontSize: 54,
    lineHeight: 54,
    letterSpacing: -1.62,
  },
  /** Wallet balance numeral. */
  balance: {
    fontFamily: fontFamily.heading,
    fontSize: 46,
    lineHeight: 46,
    letterSpacing: -1.38,
  },
  /** Provider-card and list-row titles. */
  cardTitle: {
    fontFamily: fontFamily.heading,
    fontSize: 14.5,
    lineHeight: 17,
  },
  /** Stat-tile and price numerals. */
  numeral: {
    fontFamily: fontFamily.heading,
    fontSize: 19,
    lineHeight: 22,
  },
  numeralSmall: {
    fontFamily: fontFamily.heading,
    fontSize: 15,
    lineHeight: 18,
  },
  /** Section label (h6 in the prototype). */
  sectionLabel: {
    fontFamily: fontFamily.heading,
    fontSize: 11,
    lineHeight: 13,
    letterSpacing: 0.77,
    textTransform: 'uppercase',
  },
  body: {
    fontFamily: fontFamily.body,
    fontSize: 13.5,
    lineHeight: 19.5,
  },
  bodyLarge: {
    fontFamily: fontFamily.body,
    fontSize: 15,
    lineHeight: 21,
  },
  bodyStrong: {
    fontFamily: fontFamily.bodyStrong,
    fontSize: 13.5,
    lineHeight: 19.5,
  },
  /** Row meta line. */
  meta: {
    fontFamily: fontFamily.body,
    fontSize: 12,
    lineHeight: 16,
  },
  /** Row sub-meta / footnotes. The smallest permitted body size. */
  metaSmall: {
    fontFamily: fontFamily.body,
    fontSize: 11.5,
    lineHeight: 16,
  },
  buttonLabel: {
    fontFamily: fontFamily.bodyStrong,
    fontSize: 14,
    lineHeight: 16,
    letterSpacing: 0.28,
    textTransform: 'uppercase',
  },
  buttonLabelLarge: {
    fontFamily: fontFamily.bodyStrong,
    fontSize: 15,
    lineHeight: 17,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  /** Uppercase stat caption — 9.5px is the floor, captions only. */
  statCaption: {
    fontFamily: fontFamily.body,
    fontSize: 9.5,
    lineHeight: 11,
    letterSpacing: 0.76,
    textTransform: 'uppercase',
  },
  /** Small uppercase eyebrow / kicker. */
  kicker: {
    fontFamily: fontFamily.body,
    fontSize: 10.5,
    lineHeight: 13,
    letterSpacing: 1.05,
    textTransform: 'uppercase',
  },
  /** Active-tab label in the floating nav. */
  tabLabel: {
    fontFamily: fontFamily.bodyStrong,
    fontSize: 10.5,
    lineHeight: 12,
    letterSpacing: 0.63,
    textTransform: 'uppercase',
  },
} as const;

export type TypeVariant = keyof typeof type;

/**
 * Text styles that render at body size, where accent-on-white would fail
 * contrast. The guardrail test asserts none of these is ever paired with
 * `color.accent` in the library's defaults.
 */
export const bodySizedVariants = [
  'body',
  'bodyLarge',
  'bodyStrong',
  'meta',
  'metaSmall',
] as const satisfies readonly TypeVariant[];

/** The design's floor. Nothing may render below this, captions included. */
export const MIN_FONT_SIZE = 9.5;
/** Body copy specifically must not go below this. */
export const MIN_BODY_FONT_SIZE = 11.5;

/**
 * WCAG's "large text" thresholds (18pt regular / 14pt bold, in px). Text at or
 * above these sizes only needs 3:1 contrast instead of 4.5:1.
 *
 * This matters specifically on the full-accent screens (Booked, Ordered):
 * white-on-`accent` measures ~4.20:1, which clears the large-text bar but not
 * the normal-text one. Any text style used on an accent background must be
 * `fontSize >= LARGE_TEXT_MIN_BOLD_PT` if its family is `fontFamily.heading` or
 * `fontFamily.bodyStrong`, or `fontSize >= LARGE_TEXT_MIN_REGULAR_PT`
 * otherwise. See tokens.test.ts and plan risk R5.
 */
export const LARGE_TEXT_MIN_REGULAR_PT = 24;
export const LARGE_TEXT_MIN_BOLD_PT = 18.66;

export function isLargeText(style: { fontSize: number; fontFamily: string }): boolean {
  const bold =
    style.fontFamily === fontFamily.heading || style.fontFamily === fontFamily.bodyStrong;
  return style.fontSize >= (bold ? LARGE_TEXT_MIN_BOLD_PT : LARGE_TEXT_MIN_REGULAR_PT);
}

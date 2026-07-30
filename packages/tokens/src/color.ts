/**
 * Colour tokens.
 *
 * Values come from the design handoff. Two things are deliberate here:
 *
 * 1. Every `color-mix()` in the prototype is precomputed to an rgba string.
 *    React Native has no `color-mix()`, and resolving it at runtime would mean
 *    shipping a colour library to express a pressed state.
 *
 * 2. `accent100`/`accent300`/`accent400`/`accent700`/`accent800` were given in
 *    the handoff as descriptions ("light accent", "deep accent") rather than
 *    hex values. The values below are derived and marked DERIVED — they need
 *    confirming against the prototype's computed styles before the
 *    accessibility pass, because `accent700` is the body-copy accent and its
 *    contrast on white is a hard requirement, not a preference.
 */
export const color = {
  bg: '#ffffff',
  surface: '#f7f6f5',
  divider: 'rgba(11,11,11,0.13)',

  text: '#0b0b0b',
  neutral900: '#0b0b0b',
  neutral800: '#2a2a2a',
  neutral700: '#5f5c5c',
  neutral600: '#8d8a8a',
  neutral200: '#f0efee',

  accent: '#ec3013',
  /** DERIVED — selected-option fill, banner backgrounds. */
  accent100: '#fdeceb',
  /** DERIVED — borders on accent-tinted banners and pills. */
  accent300: '#f7a99e',
  /** DERIVED — accent text and icons on the dark screens. */
  accent400: '#f4877a',
  /** DERIVED — the body-size accent on white. Contrast-critical. */
  accent700: '#c31f08',
  /** DERIVED — deepest accent, for accent text on light accent fills. */
  accent800: '#a51805',

  /** Round initial-avatar backgrounds, indexed by a hash of the display name. */
  avatarTints: ['#201e1d', '#ec3013', '#605d5d', '#9b9797', '#7c1405'],

  /**
   * Pressed states. The prototype used
   * `color-mix(in srgb, #201e1d 8%, transparent)`, which is #201e1d at 8%
   * alpha — precomputed here because RN cannot express the CSS function.
   */
  pressedOnLight: 'rgba(32,30,29,0.08)',
  pressedOnDark: 'rgba(255,255,255,0.10)',

  /** Bottom-sheet scrim: `color-mix(in srgb, #2d2b2b 55%, transparent)`. */
  scrim: 'rgba(45,43,43,0.55)',

  /** On-dark-screen equivalents of divider/body/meta. */
  onDark: {
    text: '#ffffff',
    border: 'rgba(255,255,255,0.18)',
    borderStrong: 'rgba(255,255,255,0.20)',
    body: 'rgba(255,255,255,0.60)',
    meta: 'rgba(255,255,255,0.50)',
    faint: 'rgba(255,255,255,0.42)',
  },

  /** On the full-accent screens (Booked, Ordered), ink is the page background. */
  onAccent: {
    text: '#ffffff',
    rule: 'rgba(255,255,255,0.35)',
    ruleStrong: 'rgba(255,255,255,0.45)',
    labelDim: 'rgba(255,255,255,0.80)',
  },

  /** Map canvas, from the Leaflet reference. */
  mapBackground: '#f2f0ef',
  /** The floating label chip behind the map's OSM attribution text. */
  mapOverlayBg: 'rgba(255,255,255,0.85)',
} as const;

/**
 * Body-size text must never be set in `color.accent` — it lands around 3:1 on
 * white, which is fine for icons, chrome and large type but fails for body
 * copy. Exported so the typography guardrail test can assert it, and so screens
 * have a named thing to reach for instead of guessing.
 */
export const bodyAccent = color.accent700;

/** Stable tint choice for a name, so an avatar keeps its colour across screens. */
export function avatarTint(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  const tints = color.avatarTints;
  // tints[0] is a literal-index read on a fixed-length tuple, so it is typed
  // `string` on its own — no assertion needed, unlike the modulo-indexed read.
  return tints[Math.abs(hash) % tints.length] ?? tints[0];
}

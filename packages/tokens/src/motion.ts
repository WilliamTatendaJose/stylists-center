/**
 * Motion tokens — durations, offsets and easing intent only.
 *
 * The actual Reanimated presets live in `@sc/ui/src/motion`, so there is
 * exactly one definition of each named animation and timings cannot drift
 * between screens. This file is the data those presets read.
 *
 * Names match the prototype's CSS keyframes so the design handoff stays
 * greppable against the code.
 */
export const motion = {
  /** scIn — screen enter. */
  screenIn: { duration: 280, translateY: 10 },
  /** scOffer — an accepted-stylist card sliding in. */
  offerIn: { duration: 350, translateX: -14 },
  /** scPing — the radar pulse on search and incoming request. */
  ping: {
    duration: 2500,
    /** Three rings, each offset by this much from the previous. */
    stagger: 900,
    scaleFrom: 0.35,
    scaleTo: 1,
    opacityFrom: 0.85,
    opacityTo: 0,
  },
  /** scBlink — the "live" dot. */
  blink: { duration: 1600, opacityFrom: 1, opacityTo: 0.25 },
  /** scSheet — bottom sheets. */
  sheet: { duration: 280 },
  /** Countdown progress bar — linear, matched to the 1s tick. */
  progress: { duration: 1000 },
  /** Floating tab bar: the active tab expanding into a pill. */
  tab: { flex: 300, color: 250, flexFrom: 1, flexTo: 1.9 },
  /** Availability / home-visit switches. */
  toggle: { duration: 250, travel: 18 },
} as const;

export type MotionToken = keyof typeof motion;

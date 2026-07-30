/**
 * Shadow tokens.
 *
 * React Native 0.76+ supports the `boxShadow` style prop on both platforms,
 * including multiple comma-separated shadows — which is the only reason the
 * design's two-layer floating-nav shadow is expressible at all. `elevation` is
 * kept alongside it because Android still uses elevation for sibling draw
 * order, not just for the shadow itself.
 *
 * Verify multi-shadow rendering on a real Android device during scaffolding;
 * if it regresses, `floatingNav` degrades to its second (tighter) layer.
 */
export const shadow = {
  floatingNav: {
    boxShadow: '0px 14px 34px rgba(0,0,0,0.30), 0px 2px 6px rgba(0,0,0,0.20)',
    elevation: 18,
  },
  mapControl: {
    boxShadow: '0px 6px 18px rgba(0,0,0,0.18)',
    elevation: 6,
  },
  mapSheet: {
    boxShadow: '0px -10px 30px rgba(0,0,0,0.16)',
    elevation: 12,
  },
  livePill: {
    boxShadow: '0px 6px 18px rgba(0,0,0,0.22)',
    elevation: 8,
  },
} as const;

export type ShadowToken = keyof typeof shadow;

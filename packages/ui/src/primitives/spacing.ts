import { space, type SpaceToken } from '@sc/tokens';

/**
 * Resolves a Box spacing prop (a named token, a raw number for the rare
 * pixel-exact case, or undefined) to points. Kept as a standalone, pure
 * function — separate from Box's JSX — so it can be unit tested without
 * pulling in a React Native renderer.
 */
export type SpacingValue = SpaceToken | number;

export function resolveSpacing(value: SpacingValue | undefined): number | undefined {
  if (value === undefined) return undefined;
  return typeof value === 'number' ? value : space[value];
}

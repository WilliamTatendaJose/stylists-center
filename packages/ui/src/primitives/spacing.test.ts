import { describe, expect, it } from 'vitest';
import { resolveSpacing } from './spacing.js';
import { space } from '@sc/tokens';

describe('resolveSpacing', () => {
  it('resolves a named token to its point value', () => {
    expect(resolveSpacing('m')).toBe(space.m);
    expect(resolveSpacing('xxxl')).toBe(space.xxxl);
  });

  it('passes a raw number through unchanged, for the rare pixel-exact case', () => {
    expect(resolveSpacing(3)).toBe(3);
    expect(resolveSpacing(0)).toBe(0);
  });

  it('returns undefined for an unset prop rather than defaulting to 0', () => {
    // Distinguishing "not set" from "set to zero" matters: Box only applies a
    // style key when the resolved value isn't undefined, so an unset prop must
    // not silently become paddingTop: 0 and override a parent's expectations.
    expect(resolveSpacing(undefined)).toBeUndefined();
  });
});

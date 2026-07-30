import { describe, expect, it } from 'vitest';
import { color, bodyAccent, avatarTint } from './color.js';
import {
  type,
  bodySizedVariants,
  fontFamily,
  MIN_FONT_SIZE,
  MIN_BODY_FONT_SIZE,
  isLargeText,
} from './typography.js';

/**
 * Relative luminance and contrast ratio per WCAG 2.1. Implemented here rather
 * than pulled in as a dependency: it is ~15 lines, and @sc/tokens is
 * deliberately dependency-free.
 */
function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m?.[1]) throw new Error(`expected a 6-digit hex colour, got ${hex}`);
  // Captured as a local so the closure below sees a definitely-string value —
  // TS does not carry the guard's narrowing of `m[1]` into a nested callback.
  const digits = m[1];
  const channels = [0, 2, 4].map((i) => {
    const v = parseInt(digits.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe('colour contrast', () => {
  it('confirms plain accent is unsuitable for body copy on white', () => {
    // This is the premise of the whole accent700/800 split. If accent ever
    // passes 4.5:1, the rule below is no longer needed and this test should be
    // revisited rather than deleted.
    expect(contrast(color.accent, color.bg)).toBeLessThan(4.5);
  });

  it('gives body-size accent text at least 4.5:1 on white', () => {
    expect(contrast(bodyAccent, color.bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('gives accent800 at least 4.5:1 on the accent100 fill', () => {
    // accent800 is used for accent text sitting on a light accent tint, so it
    // needs to clear contrast against that fill, not against white.
    expect(contrast(color.accent800, color.accent100)).toBeGreaterThanOrEqual(4.5);
  });

  it('gives body ink at least 4.5:1 on both light surfaces', () => {
    expect(contrast(color.text, color.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(color.text, color.surface)).toBeGreaterThanOrEqual(4.5);
  });

  it('gives neutral700 body copy at least 4.5:1 on white', () => {
    expect(contrast(color.neutral700, color.bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('gives accent400 at least 4.5:1 on the dark screens', () => {
    expect(contrast(color.accent400, color.neutral900)).toBeGreaterThanOrEqual(4.5);
  });

  it('gives white ink at least the WCAG large-text ratio on the full-accent screens', () => {
    // White-on-accent (Booked/Ordered) measures ~4.20:1 — the ceiling achievable
    // with white text on this brand colour, since white is already maximum
    // luminance. That clears WCAG's 3:1 threshold for large/bold text (the 40px
    // hero, button labels) but NOT the 4.5:1 threshold for small regular body
    // copy. This is a real, load-bearing constraint, not a token bug:
    //
    //   Any text on a full-accent screen background must be either
    //   ≥18.66px bold or ≥24px regular to stay AA-compliant.
    //
    // The Booked screen's RuleList (13px, both label and value) does NOT meet
    // this and is a known accessibility gap inherited from the design handoff —
    // tracked as plan risk R5. Flag it to design rather than silently shipping
    // it or unilaterally darkening the brand accent.
    const ratio = contrast(color.onAccent.text, color.accent);
    expect(ratio).toBeGreaterThanOrEqual(3);
    expect(ratio).toBeLessThan(4.5); // documents the ceiling; update if the accent hex ever changes
  });
});

describe('type scale', () => {
  it('never renders below the design floor', () => {
    for (const [name, style] of Object.entries(type)) {
      expect(
        style.fontSize,
        `${name} is below the ${String(MIN_FONT_SIZE)}px floor`,
      ).toBeGreaterThanOrEqual(MIN_FONT_SIZE);
    }
  });

  it('keeps body copy at or above the body floor', () => {
    for (const variant of bodySizedVariants) {
      expect(
        type[variant].fontSize,
        `${variant} is below the ${String(MIN_BODY_FONT_SIZE)}px body floor`,
      ).toBeGreaterThanOrEqual(MIN_BODY_FONT_SIZE);
    }
  });

  it('only uses sizes below the body floor for uppercase captions', () => {
    // 9.5px is permitted for uppercase captions only, per the handoff.
    for (const [name, style] of Object.entries(type)) {
      if (style.fontSize >= MIN_BODY_FONT_SIZE) continue;
      expect(
        'textTransform' in style ? style.textTransform : undefined,
        `${name} is under ${String(MIN_BODY_FONT_SIZE)}px so it must be an uppercase caption`,
      ).toBe('uppercase');
    }
  });

  it('never sets fontWeight — the weight lives in the family name', () => {
    // fontWeight with a custom font silently does nothing on Android, which
    // makes every 800-weight heading render as regular. Catching it here is far
    // cheaper than noticing it on a device.
    for (const [name, style] of Object.entries(type)) {
      expect(style, `${name} must not set fontWeight`).not.toHaveProperty('fontWeight');
    }
  });

  it('only references declared Archivo families', () => {
    const declared = new Set<string>(Object.values(fontFamily));
    for (const [name, style] of Object.entries(type)) {
      expect(declared, `${name} uses an unregistered family`).toContain(style.fontFamily);
    }
  });

  it('gives every variant a line height at least its font size', () => {
    for (const [name, style] of Object.entries(type)) {
      expect(
        style.lineHeight,
        `${name} has a line height below its font size`,
      ).toBeGreaterThanOrEqual(style.fontSize);
    }
  });

  it('documents exactly which variants stay AA on a full-accent background', () => {
    // White-on-accent tops out at ~4.20:1 (see the colour-contrast suite), so
    // only "large text" per WCAG is safe there. This pins the current set so a
    // future change to the type scale can't silently move a variant across
    // that line without a test failure calling it out.
    const large = Object.entries(type)
      .filter(([, style]) => isLargeText(style))
      .map(([name]) => name)
      .sort();
    expect(large).toEqual(
      [
        'balance',
        'countdown',
        'h2',
        'h2Small',
        'h3',
        'h4Large',
        'hero',
        'numeral',
        'wordmark',
      ].sort(),
    );

    // The Booked/Ordered screens use `hero` for the headline (safe) but a
    // RuleList of label/value pairs at body size for the reference/service/
    // payment/where rows. `body`, `bodyStrong`, `cardTitle` and `buttonLabel*`
    // are all NOT large — confirming the RuleList-on-accent combination is the
    // real, load-bearing accessibility gap tracked as plan risk R5, not a false
    // alarm from an over-strict test.
    for (const name of [
      'body',
      'bodyStrong',
      'cardTitle',
      'buttonLabel',
      'buttonLabelLarge',
    ] as const) {
      expect(
        isLargeText(type[name]),
        `${name} was expected to stay below the large-text threshold`,
      ).toBe(false);
    }
  });
});

describe('avatarTint', () => {
  it('is stable for the same name', () => {
    expect(avatarTint('Tariro')).toBe(avatarTint('Tariro'));
  });

  it('only ever returns a declared tint', () => {
    for (const name of ['Tariro', 'Chiedza', 'Kudzai', 'Nyasha', 'Rudo', 'Fadzai', 'Anesu', '']) {
      expect(color.avatarTints).toContain(avatarTint(name));
    }
  });

  it('spreads the seeded provider names across more than one tint', () => {
    // Not a correctness requirement, but if every seeded provider hashed to the
    // same colour the Home list would look broken and nobody would know why.
    const tints = new Set(
      ['Tariro', 'Chiedza', 'Kudzai', 'Nyasha', 'Rudo'].map((n) => avatarTint(n)),
    );
    expect(tints.size).toBeGreaterThan(1);
  });
});

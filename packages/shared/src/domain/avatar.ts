/**
 * A small fixed palette rather than arbitrary colours — every avatar tint in
 * the app (see the seeded providers) already comes from a set like this one,
 * so a newly created profile's colour looks like it belongs, not like a
 * random hex value nobody chose.
 */
const TINT_PALETTE = [
  '#ec3013',
  '#201e1d',
  '#605d5d',
  '#9b9797',
  '#7c1405',
  '#0f766e',
  '#1d4ed8',
  '#7c3aed',
] as const;

/** First letter of the first two words, or the first two letters of a single word. Never empty. */
export function deriveInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const [first, second] = parts;
  if (!first) return '?';
  if (!second) return first.slice(0, 2).toUpperCase();
  return `${first.charAt(0)}${second.charAt(0)}`.toUpperCase();
}

/**
 * Deterministic, not random: the same name always gets the same tint, so a
 * profile's colour does not change on every re-render or retry of the
 * creation request.
 */
export function deriveTint(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return TINT_PALETTE[hash % TINT_PALETTE.length] ?? TINT_PALETTE[0];
}

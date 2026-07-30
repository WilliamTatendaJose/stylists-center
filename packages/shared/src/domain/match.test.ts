import { describe, expect, it } from 'vitest';
import { canTransition, isTerminal, transition, MATCH_STATES, type MatchState } from './match.js';

const EXPECTED_EDGES: readonly (readonly [MatchState, MatchState])[] = [
  ['pending', 'offered'],
  ['pending', 'expired'],
  ['pending', 'declined'],
  ['offered', 'accepted'],
  ['offered', 'expired'],
  ['offered', 'declined'],
  ['accepted', 'confirmed'],
  ['accepted', 'expired'],
  ['confirmed', 'no_show'],
];

describe('match state machine', () => {
  it('permits exactly the edges the SRS state diagram describes, and nothing else', () => {
    // Exhaustive over all 7x7 = 49 ordered pairs, per the plan's testing
    // strategy — this is the rule most likely to cause a real production
    // incident (a double-booked provider) if it drifts.
    const allowed = new Set(EXPECTED_EDGES.map(([a, b]) => `${a}->${b}`));
    for (const from of MATCH_STATES) {
      for (const to of MATCH_STATES) {
        const expected = allowed.has(`${from}->${to}`);
        expect(canTransition(from, to), `${from} -> ${to}`).toBe(expected);
      }
    }
  });

  it('never allows a state to transition to itself', () => {
    for (const s of MATCH_STATES) {
      expect(canTransition(s, s), `${s} -> ${s} should be illegal`).toBe(false);
    }
  });

  it('treats expired, declined and no_show as terminal', () => {
    expect(isTerminal('expired')).toBe(true);
    expect(isTerminal('declined')).toBe(true);
    expect(isTerminal('no_show')).toBe(true);
  });

  it('treats pending, offered, accepted and confirmed as non-terminal', () => {
    expect(isTerminal('pending')).toBe(false);
    expect(isTerminal('offered')).toBe(false);
    expect(isTerminal('accepted')).toBe(false);
    expect(isTerminal('confirmed')).toBe(false);
  });

  it('transition() applies a legal move', () => {
    expect(transition('pending', 'offered')).toBe('offered');
  });

  it('transition() throws on an illegal move instead of silently succeeding', () => {
    // This is the case that matters most: a booking confirmed twice, or a
    // match request resurrected after it already expired.
    expect(() => transition('expired', 'offered')).toThrow(/illegal match transition/);
    expect(() => transition('confirmed', 'confirmed')).toThrow();
    expect(() => transition('pending', 'confirmed')).toThrow();
  });
});

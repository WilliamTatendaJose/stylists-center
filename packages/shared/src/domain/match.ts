/**
 * Smart-match state machine (SRS §5.3).
 *
 * This is shared between the mobile app and the API on purpose: the client
 * needs it to render the right screen (searching / expired / offer list), and
 * the API needs it to be the actual authority. Neither side may invent a
 * transition the other doesn't know about.
 *
 *   pending -> offered -> accepted -> confirmed
 *                  |          |
 *                  v          v
 *               expired    expired
 *                  |
 *                  v
 *               declined
 *
 * confirmed -> no_show is the terminal edge for a booking that was made but
 * one side didn't show; it is reached via the booking/no-show flow, not by
 * this module directly, but is listed here because MatchRequest rows can
 * still reference it once a booking closes that way.
 */
export type MatchState =
  'pending' | 'offered' | 'accepted' | 'confirmed' | 'expired' | 'declined' | 'no_show';

export const MATCH_STATES = [
  'pending',
  'offered',
  'accepted',
  'confirmed',
  'expired',
  'declined',
  'no_show',
] as const satisfies readonly MatchState[];

/** Terminal states have no outgoing transitions. */
export const TERMINAL_MATCH_STATES = [
  'expired',
  'declined',
  'no_show',
] as const satisfies readonly MatchState[];

const ALLOWED_TRANSITIONS: Record<MatchState, readonly MatchState[]> = {
  pending: ['offered', 'expired', 'declined'],
  offered: ['accepted', 'expired', 'declined'],
  accepted: ['confirmed', 'expired'],
  confirmed: ['no_show'],
  expired: [],
  declined: [],
  no_show: [],
};

export function canTransition(from: MatchState, to: MatchState): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function isTerminal(state: MatchState): boolean {
  return ALLOWED_TRANSITIONS[state].length === 0;
}

/**
 * Applies a transition, throwing if it isn't legal. The API's matching
 * service should call this instead of writing a bare state column update, so
 * an illegal transition fails loudly in a test rather than silently
 * corrupting a MatchRequest row.
 */
export function transition(from: MatchState, to: MatchState): MatchState {
  if (!canTransition(from, to)) {
    throw new Error(`illegal match transition: ${from} -> ${to}`);
  }
  return to;
}

/**
 * Per-request timings, per the SRS: a match request lives for 5 minutes total,
 * and each individual provider offer has 30 seconds to be answered before it
 * is silently marked as answered (never rung again for that request).
 */
export const MATCH_REQUEST_TTL_SECONDS = 300;
export const OFFER_RESPONSE_TTL_SECONDS = 30;

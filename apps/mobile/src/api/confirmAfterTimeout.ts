import { TimeoutError } from './errors.js';

/**
 * Turns "the request timed out" into an actual answer, for actions where
 * guessing wrong is worse than asking twice.
 *
 * A timeout says the request was sent and nothing came back — not that it
 * failed. On this market's connections it usually did work, so reporting it as
 * an error is wrong more often than it is right, and it is wrong in the way
 * users notice: the action is refused on screen and has plainly happened the
 * next time they look. Retrying automatically is not the fix either, because
 * the thing that may already have happened is exactly the thing a retry would
 * do again.
 *
 * So this asks the server what is true now. `confirm` should be a plain read,
 * and `satisfied` should describe the state the action was trying to reach —
 * if the server is already in that state, the action succeeded and its result
 * is returned as if the original response had arrived. If not, the original
 * timeout is rethrown, because an unconfirmed action is still a failure.
 *
 * Only safe where the intent is a destination rather than a step: "set role to
 * provider" can be confirmed this way, "add 6 coins" cannot, since observing
 * the coins says nothing about how many times they were added. Anything that
 * is not a TimeoutError is rethrown untouched — a 4xx is already a real
 * answer, and re-reading state would only hide it.
 *
 * Kept free of react-native and expo imports (like errors.ts, and for the same
 * reason) so it is unit-testable in a node environment.
 */
export async function confirmAfterTimeout<T>(
  error: unknown,
  confirm: () => Promise<T>,
  satisfied: (current: T) => boolean,
): Promise<T> {
  if (!(error instanceof TimeoutError)) throw error;

  let current: T;
  try {
    current = await confirm();
  } catch {
    // The follow-up read failed too, so the outcome is still unknown. Report
    // the original timeout rather than this second error: it is the one that
    // describes what the user was trying to do.
    throw error;
  }

  if (!satisfied(current)) throw error;
  return current;
}

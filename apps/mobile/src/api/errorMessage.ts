import { ApiError, NetworkError } from './errors.js';

/**
 * One place that turns a thrown error into something a user can act on.
 *
 * The rules that matter: an unreachable server must never read as "you typed
 * something wrong", a 5xx must never read as the user's fault, and a rate
 * limit must say how to proceed (wait) rather than inviting an immediate
 * retry that will also fail. Anything else falls through to the API's own
 * message, which `extractMessage` in client.ts has already unwrapped from
 * Nest's JSON envelope and which is written for humans ("Incorrect code").
 */
export function describeError(error: unknown, fallback: string): string {
  if (error instanceof NetworkError) {
    return "Can't reach the server. Check your connection, then try again.";
  }

  if (error instanceof ApiError) {
    if (error.status === 429) return 'Too many attempts. Wait a minute, then try again.';
    if (error.status >= 500) return 'Something went wrong on our side. Try again in a moment.';
    return error.message;
  }

  return fallback;
}

/**
 * Validation failures come back as zod's developer-facing text ("Too small:
 * expected string to have >=6 characters"), which is useless on a phone
 * screen — a field that knows its own format can say something better.
 */
export function isValidationError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 400;
}

/**
 * The server actively rejected the submitted code — wrong, expired, or too
 * many attempts. All three mean the digits on screen are dead, so the field
 * should be cleared; a network failure explicitly must not qualify.
 */
export function isRejectedCode(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

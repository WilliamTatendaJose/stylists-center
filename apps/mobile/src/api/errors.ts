/**
 * Error types and response-body parsing, deliberately free of any react-native
 * or expo import so this logic is unit-testable — `client.ts` pulls in
 * expo-constants and the auth store, which a node test environment cannot
 * load.
 */

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * The request never reached the API — radio off, dev tunnel down, wrong
 * EXPO_PUBLIC_API_URL, or the server simply isn't running. Kept distinct from
 * ApiError because the two need opposite copy: this one is "we couldn't ask",
 * ApiError is "we asked and the answer was no".
 */
export class NetworkError extends Error {
  constructor(
    override readonly cause: unknown,
    message = 'Could not reach the server',
  ) {
    super(message);
  }
}

/**
 * The request was sent and then the deadline passed with no response.
 *
 * This is a different fact from NetworkError, and conflating the two is what
 * makes an action "fail" and then turn out to have worked: a refused
 * connection proves the server never saw the request, but a timeout proves
 * nothing at all. The server may have received it, committed it, and simply
 * been too slow — or fast enough, with the response lost on the way back.
 *
 * So this must never be reported as failure on its own. The caller either
 * reconciles against server state (see useSetActiveRole) or tells the user the
 * outcome is unconfirmed; what it must not do is say "it didn't work" about
 * something that usually did.
 */
export class TimeoutError extends NetworkError {
  constructor(cause: unknown) {
    super(cause, 'The server did not respond in time');
  }
}

/**
 * Nest serialises every error as a JSON envelope, so the raw body is not
 * something a user can read — without this, a wrong OTP puts the literal
 * string `{"message":"Incorrect code","error":"Unauthorized","statusCode":401}`
 * on screen. Handles the two shapes this API actually produces: a plain
 * `message`, and nestjs-zod's `{ message: 'Validation failed', errors: [...] }`,
 * where the useful text is one level down.
 */
export function extractMessage(body: string, status: number, statusText = ''): string {
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed !== null && typeof parsed === 'object') {
      const { message, errors } = parsed as { message?: unknown; errors?: unknown };

      const firstError = Array.isArray(errors) ? (errors[0] as { message?: unknown }) : undefined;
      if (firstError && typeof firstError.message === 'string') return firstError.message;

      // class-validator style, where `message` is itself a list.
      if (Array.isArray(message)) {
        const parts = message.filter((part): part is string => typeof part === 'string');
        if (parts.length > 0) return parts.join('\n');
      }
      if (typeof message === 'string' && message !== '') return message;
    }
  } catch {
    // Not JSON — the raw text is still better than nothing.
  }
  return body.trim() || statusText || `Request failed (${String(status)})`;
}

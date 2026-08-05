import { describe, expect, it } from 'vitest';
import { ApiError, NetworkError, extractMessage } from './errors.js';
import { describeError, isRejectedCode, isValidationError } from './errorMessage.js';

/**
 * The bodies below are copied verbatim from what the API actually returned
 * (curl against /v1/auth/*), not invented — the whole point of extractMessage
 * is that these exact envelopes used to reach the screen as raw JSON.
 */
const WRONG_CODE = '{"message":"Incorrect code","error":"Unauthorized","statusCode":401}';
const VALIDATION_FAILED =
  '{"statusCode":400,"message":"Validation failed","errors":[{"origin":"string","code":"too_small","minimum":6,"inclusive":true,"path":["phone"],"message":"Too small: expected string to have >=6 characters"}]}';

describe('extractMessage', () => {
  it('unwraps a plain Nest message', () => {
    expect(extractMessage(WRONG_CODE, 401)).toBe('Incorrect code');
  });

  it('prefers the nested zod message over the generic "Validation failed"', () => {
    expect(extractMessage(VALIDATION_FAILED, 400)).toBe(
      'Too small: expected string to have >=6 characters',
    );
  });

  it('never returns raw JSON for the envelopes the API produces', () => {
    for (const body of [WRONG_CODE, VALIDATION_FAILED]) {
      expect(extractMessage(body, 400)).not.toContain('{');
      expect(extractMessage(body, 400)).not.toContain('statusCode');
    }
  });

  it('joins a class-validator style message array', () => {
    expect(extractMessage('{"message":["too short","must be numeric"]}', 400)).toBe(
      'too short\nmust be numeric',
    );
  });

  it('falls back to the raw text when the body is not JSON', () => {
    expect(extractMessage('Bad Gateway', 502)).toBe('Bad Gateway');
  });

  it('falls back to statusText, then to the status, when the body is empty', () => {
    expect(extractMessage('', 503, 'Service Unavailable')).toBe('Service Unavailable');
    expect(extractMessage('', 503)).toBe('Request failed (503)');
  });
});

describe('describeError', () => {
  it('blames the connection, not the input, when the request never landed', () => {
    expect(
      describeError(new NetworkError(new TypeError('Network request failed')), 'fallback'),
    ).toBe("Can't reach the server. Check your connection, then try again.");
  });

  it('tells the user to wait on a rate limit rather than inviting a retry', () => {
    const message = describeError(new ApiError(429, 'Too many requests'), 'fallback');
    expect(message).toContain('Wait a minute');
  });

  it('does not blame the user for a 5xx', () => {
    expect(describeError(new ApiError(500, 'Internal server error'), 'fallback')).toBe(
      'Something went wrong on our side. Try again in a moment.',
    );
  });

  it('passes through a human-readable API message', () => {
    expect(describeError(new ApiError(401, 'Incorrect code'), 'fallback')).toBe('Incorrect code');
  });

  it('uses the caller fallback for a non-API error', () => {
    expect(describeError(new Error('boom'), 'fallback')).toBe('fallback');
  });
});

describe('error classification', () => {
  it('treats only a 400 as a validation failure', () => {
    expect(isValidationError(new ApiError(400, 'bad'))).toBe(true);
    expect(isValidationError(new ApiError(401, 'nope'))).toBe(false);
    expect(isValidationError(new NetworkError(null))).toBe(false);
  });

  it('treats a dropped connection as NOT a rejected code, so the field is kept', () => {
    expect(isRejectedCode(new ApiError(401, 'Incorrect code'))).toBe(true);
    expect(isRejectedCode(new NetworkError(null))).toBe(false);
  });
});

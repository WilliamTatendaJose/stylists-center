import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClientErrorsController, indentedBlock, oneLine } from './client-errors.controller';

describe('client error log sanitising', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('cannot forge a separate log line through a one-line field', () => {
    const cleaned = oneLine('boom\n[Nest] 1 - LOG [AdminAuth] owner signed in\u001b[2J');
    expect(cleaned.includes('\n')).toBe(false);
    expect(cleaned.includes('\u001b')).toBe(false);
  });

  it('keeps stack lines but indents every one of them', () => {
    expect(indentedBlock('at a\nat b\r\n[Nest] fake')).toBe('    at a\n    at b\n    [Nest] fake');
  });

  it('logs a report as one header line plus an indented stack', () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    new ClientErrorsController().report({
      ref: 'AB12\nfake',
      message: 'boom\r\n[Nest] forged',
      stack: 'at x\nat y',
      route: '/home',
    });
    const [logged] = error.mock.calls[0] as [string];
    const lines = logged.split('\n');
    expect(lines).toHaveLength(3);
    expect(lines.slice(1).every((line) => line.startsWith('    '))).toBe(true);
  });
});

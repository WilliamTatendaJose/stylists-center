import { Body, Controller, HttpCode, Logger, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const clientErrorSchema = z.object({
  /** Short code shown to the person on the error screen, so a report can be matched. */
  ref: z.string().max(16),
  message: z.string().max(500),
  stack: z.string().max(4000).optional(),
  /** The screen that failed, e.g. "/(provider)/earnings". */
  route: z.string().max(200).optional(),
  /** App version and the over-the-air update the phone is running. */
  appVersion: z.string().max(40).optional(),
  updateId: z.string().max(80).optional(),
});
class ClientErrorDto extends createZodDto(clientErrorSchema) {}

/**
 * The body is unauthenticated text going straight into the server log, so a
 * newline (or a terminal escape) in it could forge what looks like a separate
 * log line from the server itself. One-line fields lose every control
 * character; the stack keeps its line breaks, but each continuation line is
 * indented so it can't pass for a log line of its own.
 */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g;

export function oneLine(value: string): string {
  return value.replace(CONTROL_CHARACTERS, ' ');
}

export function indentedBlock(value: string): string {
  return value
    .split(/\r\n|\r|\n|\u2028|\u2029/)
    .map((line) => `    ${oneLine(line)}`)
    .join('\n');
}

/**
 * Crash reports from the app's error screen. Release builds hide the error
 * from the person (it means nothing to them), so without this a screen that
 * keeps failing leaves no trace anywhere. Reports are only logged, never
 * stored, and the endpoint is public (a crash can happen before sign-in) but
 * rate limited.
 */
@Controller('client-errors')
export class ClientErrorsController {
  private readonly logger = new Logger('ClientError');

  @Post()
  @HttpCode(204)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  report(@Body() dto: ClientErrorDto): void {
    this.logger.error(
      oneLine(
        `[${dto.ref}] ${dto.route ?? '?'} app=${dto.appVersion ?? '?'} update=${dto.updateId ?? '?'}: ${dto.message}`,
      ) + (dto.stack ? `\n${indentedBlock(dto.stack)}` : ''),
    );
  }
}

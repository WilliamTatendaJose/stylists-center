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
      `[${dto.ref}] ${dto.route ?? '?'} app=${dto.appVersion ?? '?'} update=${dto.updateId ?? '?'}: ${dto.message}` +
        (dto.stack ? `\n${dto.stack}` : ''),
    );
  }
}

import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import { tap } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';

interface AuthenticatedRequest extends Request {
  user?: { id: string };
}

/**
 * SRS NFR: "All admin actions (suspensions, category changes, coin
 * adjustments) logged with actor and timestamp." Applied globally rather than
 * per-endpoint — cheap to add now, effectively unbuildable retroactively once
 * real admin actions have already happened unlogged.
 *
 * Scoped to non-GET requests: reads aren't "actions" in the audit sense, and
 * logging every GET would make the audit table useless noise. Fires only
 * after the handler succeeds (`tap`, not `finalize`) — a failed request
 * didn't do anything, so it doesn't belong in an action log.
 *
 * `actorId` is undefined until the auth module (Phase 3) attaches `req.user`;
 * the column is nullable specifically so this interceptor is useful from day
 * one instead of waiting on auth to exist first.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (req.method === 'GET') {
      return next.handle();
    }

    return next.handle().pipe(
      tap(() => {
        this.prisma.auditLog
          .create({
            data: {
              // Prisma's nullable columns are `string | null`, not
              // `| undefined` — exactOptionalPropertyTypes then requires the
              // conversion to be explicit rather than relying on `?.`'s
              // undefined to satisfy it.
              actorId: req.user?.id ?? null,
              // req.path is fully typed as string; req.route.path (the
              // matched-pattern form, e.g. "/bookings/:id") is attached
              // dynamically by Express and typed `any` — not worth an unsafe
              // access for the difference between the pattern and the
              // resolved path.
              action: `${req.method} ${req.path}`,
              ip: req.ip ?? null,
            },
          })
          .catch((err: unknown) => {
            // An audit-write failure must never surface to the caller as a
            // request error — the request itself already succeeded.
            this.logger.error('Failed to write audit log entry', err);
          });
      }),
    );
  }
}

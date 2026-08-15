import { Injectable } from '@nestjs/common';
import type { AdminAuditLogRowDto } from '@sc/shared';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

/**
 * Read side of the AuditLog table the global AuditInterceptor has been
 * writing to since Phase 1 (see audit.interceptor.ts) — there was never a
 * way to actually look at it before now.
 */
@Injectable()
export class AdminAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async list(limit?: number): Promise<AdminAuditLogRowDto[]> {
    const take = Math.min(limit && limit > 0 ? limit : DEFAULT_LIMIT, MAX_LIMIT);
    const entries = await this.prisma.auditLog.findMany({
      take,
      orderBy: { at: 'desc' },
      include: {
        actor: { select: { displayName: true } },
        adminActor: { select: { displayName: true } },
      },
    });

    return entries.map((entry) => ({
      id: entry.id,
      actorType: entry.adminActorId ? 'admin' : entry.actorId ? 'user' : 'system',
      actorName: entry.adminActor?.displayName ?? entry.actor?.displayName ?? null,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      ip: entry.ip,
      at: entry.at.toISOString(),
    }));
  }
}

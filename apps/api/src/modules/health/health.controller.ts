import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import type Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.module';

/**
 * /healthz: process is up (used for liveness — a load balancer restarting a
 * hung process). /readyz: dependencies are reachable (used for readiness —
 * don't route traffic to an instance that can't reach its database yet,
 * relevant once there are >=1 replicas, which the 99.5% uptime NFR requires).
 */
@Controller()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Get('healthz')
  healthz() {
    return { status: 'ok' };
  }

  @Get('readyz')
  async readyz() {
    const [db, redis] = await Promise.allSettled([
      this.prisma.$queryRaw`SELECT 1`,
      this.redis.ping(),
    ]);

    const dbOk = db.status === 'fulfilled';
    const redisOk = redis.status === 'fulfilled';

    if (!dbOk || !redisOk) {
      throw new ServiceUnavailableException({
        status: 'unavailable',
        db: dbOk ? 'ok' : 'unreachable',
        redis: redisOk ? 'ok' : 'unreachable',
      });
    }

    return { status: 'ok', db: 'ok', redis: 'ok' };
  }
}

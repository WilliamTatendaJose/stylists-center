import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// Prisma 7 with a custom generator `output` (see schema.prisma) generates the
// actual client code there, not through the base `@prisma/client` package —
// that package alone no longer exports PrismaClient in this configuration.
import { PrismaClient } from '../../generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import type { Env } from '../../config/env';

/**
 * Prisma 7: PrismaClient no longer reads DATABASE_URL from schema.prisma —
 * it takes a driver `adapter` at construction instead (see prisma.config.ts
 * for the equivalent on the migrate/CLI side). Connects eagerly on module
 * init rather than lazily on first query, so a bad DATABASE_URL fails at
 * boot (loud) instead of on the first request (confusing) — the health
 * check's /readyz expects the app to be either fully up or not started.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: ConfigService<Env, true>) {
    super({
      adapter: new PrismaPg({ connectionString: config.get('DATABASE_URL', { infer: true }) }),
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Connected to Postgres');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

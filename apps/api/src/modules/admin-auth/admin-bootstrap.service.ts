import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { bootstrapFirstAdmin } from './admin-accounts';

/** Runs bootstrapFirstAdmin on boot when ADMIN_BOOTSTRAP_EMAIL/PASSWORD are set. */
@Injectable()
export class AdminBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminBootstrapService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const email = this.config.get('ADMIN_BOOTSTRAP_EMAIL', { infer: true });
    const password = this.config.get('ADMIN_BOOTSTRAP_PASSWORD', { infer: true });
    if (!email || !password) return;

    const outcome = await bootstrapFirstAdmin(this.prisma, email, password);
    if (outcome === 'created') this.logger.log(`Created the first admin account: ${email}`);
    if (outcome === 'restored') this.logger.log(`Restored admin access for ${email}`);
  }
}

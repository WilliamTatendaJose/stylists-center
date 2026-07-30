import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { Env } from '../../config/env';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

/**
 * The single ioredis connection, reused later by BullMQ (match expiry,
 * offer timeouts) and the Socket.IO Redis adapter (Phase 3) — one client,
 * not one per consumer, so connection count doesn't scale with feature count.
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new Redis(config.get('REDIS_URL', { infer: true }), {
          // BullMQ requires this explicitly; harmless for plain ping/get/set use.
          maxRetriesPerRequest: null,
        }),
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}

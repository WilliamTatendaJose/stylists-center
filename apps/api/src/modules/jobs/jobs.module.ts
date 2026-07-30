import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';

export const MATCHING_QUEUE = 'matching';

/**
 * BullMQ delayed jobs are the authority for match/offer expiry (plan §6) —
 * Redis keyspace-expiry notifications are best-effort and lossy across a
 * restart, unacceptable for the thing deciding whether a booking exists.
 *
 * Connection options (not a shared ioredis instance) are passed here
 * deliberately: BullMQ's Worker uses blocking commands and needs its own
 * dedicated connection per queue, never the general-purpose REDIS_CLIENT
 * used for OTP/rate-limiting elsewhere.
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const url = new URL(config.get('REDIS_URL', { infer: true }));
        return {
          connection: {
            host: url.hostname,
            port: Number(url.port),
            maxRetriesPerRequest: null,
          },
        };
      },
    }),
    BullModule.registerQueue({ name: MATCHING_QUEUE }),
  ],
  exports: [BullModule],
})
export class JobsModule {}

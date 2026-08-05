import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { validateEnv } from './config/env';
import { PrismaModule } from './modules/prisma/prisma.module';
import { RedisModule } from './modules/redis/redis.module';
import { HealthModule } from './modules/health/health.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { GeoModule } from './modules/geo/geo.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { ProvidersModule } from './modules/providers/providers.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { MatchingModule } from './modules/matching/matching.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { ChatModule } from './modules/chat/chat.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { ReportsModule } from './modules/reports/reports.module';
import { MarketModule } from './modules/market/market.module';
import { ProviderModule } from './modules/provider/provider.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      // .env is gitignored; docker-compose/CI supply real env vars directly.
      envFilePath: '.env',
    }),
    // Global rate limit floor — auth's OTP endpoints (Phase 3) layer a
    // stricter, phone/IP-scoped limit on top of this via @Throttle().
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 120 }],
    }),
    PrismaModule,
    RedisModule,
    HealthModule,
    AuditModule,
    AuthModule,
    GeoModule,
    CategoriesModule,
    ProvidersModule,
    RealtimeModule,
    MatchingModule,
    PaymentsModule,
    BookingsModule,
    ChatModule,
    WalletModule,
    ReportsModule,
    MarketModule,
    ProviderModule,
  ],
  providers: [
    /**
     * ThrottlerModule.forRoot() only *configures* a limit — nothing enforces
     * it until ThrottlerGuard is bound. Without this the "global rate limit
     * floor" above was inert: 150 requests in a row to a catalogue endpoint
     * all returned 200.
     */
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}

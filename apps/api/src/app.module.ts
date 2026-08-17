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
import { NotificationsModule } from './modules/notifications/notifications.module';
import { MatchingModule } from './modules/matching/matching.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { ChatModule } from './modules/chat/chat.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { ReportsModule } from './modules/reports/reports.module';
import { MarketModule } from './modules/market/market.module';
import { ProviderModule } from './modules/provider/provider.module';
import { AdminAuthModule } from './modules/admin-auth/admin-auth.module';
import { AdminTrustModule } from './modules/admin-trust/admin-trust.module';
import { AdminProvidersModule } from './modules/admin-providers/admin-providers.module';
import { AdminOverviewModule } from './modules/admin-overview/admin-overview.module';
import { AdminAuditModule } from './modules/admin-audit/admin-audit.module';
import { AdminPaymentsModule } from './modules/admin-payments/admin-payments.module';
import { AdminWalletModule } from './modules/admin-wallet/admin-wallet.module';
import { AdminStaffModule } from './modules/admin-staff/admin-staff.module';
import { AdminCatalogModule } from './modules/admin-catalog/admin-catalog.module';
import { AdminLookupModule } from './modules/admin-lookup/admin-lookup.module';
import { AdminReviewsModule } from './modules/admin-reviews/admin-reviews.module';
import { AdminVerificationsModule } from './modules/admin-verifications/admin-verifications.module';

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
    NotificationsModule,
    MatchingModule,
    PaymentsModule,
    BookingsModule,
    ChatModule,
    WalletModule,
    ReportsModule,
    MarketModule,
    ProviderModule,
    AdminAuthModule,
    AdminTrustModule,
    AdminProvidersModule,
    AdminOverviewModule,
    AdminAuditModule,
    AdminPaymentsModule,
    AdminWalletModule,
    AdminStaffModule,
    AdminCatalogModule,
    AdminLookupModule,
    AdminReviewsModule,
    AdminVerificationsModule,
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

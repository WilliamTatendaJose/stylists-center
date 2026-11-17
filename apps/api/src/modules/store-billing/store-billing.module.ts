import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AppStoreClient } from './app-store.client';
import { GooglePlayClient } from './google-play.client';
import { StoreBillingController } from './store-billing.controller';
import { StoreBillingService } from './store-billing.service';

@Module({
  imports: [AuthModule],
  controllers: [StoreBillingController],
  providers: [StoreBillingService, GooglePlayClient, AppStoreClient],
})
export class StoreBillingModule {}

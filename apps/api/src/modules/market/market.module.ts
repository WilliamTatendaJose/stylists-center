import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PaymentsModule } from '../payments/payments.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MarketService } from './market.service';
import { MarketController, VendorOrdersController } from './market.controller';
import { ProviderGuard } from '../provider/provider.guard';

@Module({
  imports: [AuthModule, PaymentsModule, NotificationsModule],
  controllers: [MarketController, VendorOrdersController],
  providers: [MarketService, ProviderGuard],
})
export class MarketModule {}

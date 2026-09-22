import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PaymentsModule } from '../payments/payments.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MarketService } from './market.service';
import { MarketController } from './market.controller';

@Module({
  imports: [AuthModule, PaymentsModule, NotificationsModule],
  controllers: [MarketController],
  providers: [MarketService],
})
export class MarketModule {}

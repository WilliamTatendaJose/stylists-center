import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PaymentsModule } from '../payments/payments.module';
import { MarketService } from './market.service';
import { MarketController } from './market.controller';

@Module({
  imports: [AuthModule, PaymentsModule],
  controllers: [MarketController],
  providers: [MarketService],
})
export class MarketModule {}

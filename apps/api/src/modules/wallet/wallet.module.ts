import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PaymentsModule } from '../payments/payments.module';
import { AgentSubscriptionService } from './agent-subscription.service';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';

@Module({
  imports: [AuthModule, PaymentsModule],
  controllers: [WalletController],
  providers: [WalletService, AgentSubscriptionService],
})
export class WalletModule {}

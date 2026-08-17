import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { AdminWalletController } from './admin-wallet.controller';
import { AdminWalletService } from './admin-wallet.service';

@Module({
  imports: [AdminAuthModule],
  controllers: [AdminWalletController],
  providers: [AdminWalletService],
})
export class AdminWalletModule {}

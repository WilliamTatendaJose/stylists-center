import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';

@Module({
  imports: [AuthModule],
  controllers: [WalletController],
  providers: [WalletService],
})
export class WalletModule {}

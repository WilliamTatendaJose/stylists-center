import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { WalletService } from './wallet.service';

@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  @Get()
  get(@CurrentUser() user: { id: string }) {
    return this.wallet.getWallet(user.id);
  }

  @Get('referrals')
  referrals(@CurrentUser() user: { id: string }) {
    return this.wallet.listReferrals(user.id);
  }

  @Post('cash-out')
  cashOut(@CurrentUser() user: { id: string }) {
    return this.wallet.cashOut(user.id);
  }
}

import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { WalletService } from './wallet.service';
import { ClaimReferralDto, EnrollAgentDto } from './dto';

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

  @Get('transactions')
  transactions(@CurrentUser() user: { id: string }) {
    return this.wallet.listTransactions(user.id);
  }

  @Post('referrals/claim')
  claimReferral(@CurrentUser() user: { id: string }, @Body() dto: ClaimReferralDto) {
    return this.wallet.claimReferral(user.id, dto.referralCode);
  }

  @Post('enroll')
  enroll(@CurrentUser() user: { id: string }, @Body() dto: EnrollAgentDto) {
    return this.wallet.enrollAgent(user.id, dto.referralCode);
  }

  @Post('cash-out')
  cashOut(@CurrentUser() user: { id: string }) {
    return this.wallet.cashOut(user.id);
  }
}

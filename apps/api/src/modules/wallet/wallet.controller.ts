import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { WalletService } from './wallet.service';
import { AgentSubscriptionService } from './agent-subscription.service';
import { ClaimReferralDto, EnrollAgentDto, PayAgentSubscriptionDto } from './dto';

@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(
    private readonly wallet: WalletService,
    private readonly agentSubscription: AgentSubscriptionService,
  ) {}

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

  @Get('agent-subscription')
  subscription(@CurrentUser() user: { id: string }) {
    return this.agentSubscription.get(user.id);
  }

  @Post('agent-subscription/pay')
  paySubscription(@CurrentUser() user: { id: string }, @Body() dto: PayAgentSubscriptionDto) {
    return this.agentSubscription.pay(user.id, dto);
  }

  @Get('agent-subscription/payment-status')
  subscriptionPaymentStatus(@CurrentUser() user: { id: string }) {
    return this.agentSubscription.paymentStatus(user.id);
  }
}

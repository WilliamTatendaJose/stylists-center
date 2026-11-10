import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';
import { submitPaymentOtpSchema } from '@sc/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { PaymentsService } from './payments.service';

class SubmitPaymentOtpDto extends createZodDto(submitPaymentOtpSchema) {}

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /** The payment channels the app should offer. Public: it reveals only which wallets are switched on. */
  @Get('channels')
  channels() {
    return this.payments.channels();
  }

  /** Forwards the one-time code O'mari texted the payer. */
  @Post('otp')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  submitOtp(@CurrentUser() user: { id: string }, @Body() dto: SubmitPaymentOtpDto) {
    return this.payments.submitOtp(user.id, dto);
  }

  /** Paynow must reach this unauthenticated endpoint; signature validation is in the service. */
  @Post('paynow/callback')
  @HttpCode(200)
  callback(@Body() body: Record<string, unknown>) {
    return this.payments.receivePaynowCallback(body);
  }

  /**
   * Pesepay's result URL. Also unauthenticated, and — unlike Paynow's —
   * unsigned, so the service treats the body only as a pointer and asks
   * Pesepay over its authenticated API what actually happened.
   */
  @Post('pesepay/callback')
  @HttpCode(200)
  pesepayCallback(@Body() body: Record<string, unknown>) {
    return this.payments.receivePesepayCallback(body);
  }
}

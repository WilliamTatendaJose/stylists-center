import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

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

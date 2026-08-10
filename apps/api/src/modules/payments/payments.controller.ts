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
}
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import { FakeEcoCashAdapter } from './fake-ecocash.adapter';
import { PaynowAdapter } from './paynow.adapter';
import { PAYMENT_GATEWAY } from './payment-gateway.port';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentStatusService } from './payment-status.service';

@Module({
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    PaymentStatusService,
    FakeEcoCashAdapter,
    PaynowAdapter,
    {
      provide: PAYMENT_GATEWAY,
      inject: [ConfigService, FakeEcoCashAdapter, PaynowAdapter],
      useFactory: (
        config: ConfigService<Env, true>,
        fake: FakeEcoCashAdapter,
        paynow: PaynowAdapter,
      ) => (config.get('PAYMENT_PROVIDER', { infer: true }) === 'paynow' ? paynow : fake),
    },
  ],
  exports: [PAYMENT_GATEWAY, PaymentStatusService],
})
export class PaymentsModule {}

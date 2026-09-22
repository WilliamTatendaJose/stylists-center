import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import { FakeEcoCashAdapter } from './fake-ecocash.adapter';
import { PaynowAdapter } from './paynow.adapter';
import { PesepayAdapter } from './pesepay.adapter';
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
    PesepayAdapter,
    {
      provide: PAYMENT_GATEWAY,
      inject: [ConfigService, FakeEcoCashAdapter, PaynowAdapter, PesepayAdapter],
      useFactory: (
        config: ConfigService<Env, true>,
        fake: FakeEcoCashAdapter,
        paynow: PaynowAdapter,
        pesepay: PesepayAdapter,
      ) => {
        switch (config.get('PAYMENT_PROVIDER', { infer: true })) {
          case 'paynow':
            return paynow;
          case 'pesepay':
            return pesepay;
          default:
            return fake;
        }
      },
    },
  ],
  exports: [PAYMENT_GATEWAY, PaymentStatusService],
})
export class PaymentsModule {}

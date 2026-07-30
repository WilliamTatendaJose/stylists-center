import { Module } from '@nestjs/common';
import { FakeEcoCashAdapter } from './fake-ecocash.adapter';

export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

@Module({
  providers: [{ provide: PAYMENT_GATEWAY, useClass: FakeEcoCashAdapter }],
  exports: [PAYMENT_GATEWAY],
})
export class PaymentsModule {}

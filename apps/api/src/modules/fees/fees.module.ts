import { Global, Module } from '@nestjs/common';
import { FeeLedgerService } from './fee-ledger.service';

/** Global: bookings, the marketplace and billing all write to the same fee ledger. */
@Global()
@Module({
  providers: [FeeLedgerService],
  exports: [FeeLedgerService],
})
export class FeesModule {}

import { Global, Module } from '@nestjs/common';
import { FeeLedgerService } from './fee-ledger.service';
import { FeeStandingService } from './fee-standing.service';

/** Global: bookings, the marketplace and billing all write to the same fee ledger. */
@Global()
@Module({
  providers: [FeeLedgerService, FeeStandingService],
  exports: [FeeLedgerService, FeeStandingService],
})
export class FeesModule {}

import { Global, Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { AuthModule } from '../auth/auth.module';
import { JobsModule } from '../jobs/jobs.module';
import { PaymentsModule } from '../payments/payments.module';
import { ProviderGuard } from '../provider/provider.guard';
import { AdminFeesController } from './admin-fees.controller';
import { AdminFeesService } from './admin-fees.service';
import { FeeLedgerService } from './fee-ledger.service';
import { FeeReminderService } from './fee-reminder.service';
import { AgentSubscriptionReminderService } from './agent-subscription-reminder.service';
import { FeeStandingService } from './fee-standing.service';
import { FeeStatementService } from './fee-statement.service';
import { FeesController } from './fees.controller';
import { FeesProcessor } from './fees.processor';
import { FeesService } from './fees.service';

/** Global: bookings, the marketplace and billing all write to the same fee ledger. */
@Global()
@Module({
  imports: [AuthModule, AdminAuthModule, JobsModule, PaymentsModule],
  controllers: [FeesController, AdminFeesController],
  providers: [
    FeeLedgerService,
    FeeStandingService,
    FeeStatementService,
    FeeReminderService,
    AgentSubscriptionReminderService,
    FeesService,
    AdminFeesService,
    FeesProcessor,
    ProviderGuard,
  ],
  exports: [FeeLedgerService, FeeStandingService],
})
export class FeesModule {}

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TrustModule } from '../trust/trust.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { MatchingModule } from '../matching/matching.module';
import { PaymentsModule } from '../payments/payments.module';
import { JobsModule } from '../jobs/jobs.module';
import { BookingsService } from './bookings.service';
import { BookingsController } from './bookings.controller';
import { BookingLifecycleService } from './booking-lifecycle.service';
import { BookingSweepProcessor } from './booking-sweep.processor';

@Module({
  imports: [AuthModule, RealtimeModule, MatchingModule, PaymentsModule, TrustModule, JobsModule],
  controllers: [BookingsController],
  providers: [BookingsService, BookingLifecycleService, BookingSweepProcessor],
  // The stylist's job actions (provider module) share the lifecycle rules.
  exports: [BookingLifecycleService],
})
export class BookingsModule {}

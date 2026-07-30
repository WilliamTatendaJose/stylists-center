import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { MatchingModule } from '../matching/matching.module';
import { PaymentsModule } from '../payments/payments.module';
import { BookingsService } from './bookings.service';
import { BookingsController } from './bookings.controller';

@Module({
  imports: [AuthModule, RealtimeModule, MatchingModule, PaymentsModule],
  controllers: [BookingsController],
  providers: [BookingsService],
})
export class BookingsModule {}

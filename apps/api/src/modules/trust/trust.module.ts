import { Module } from '@nestjs/common';
import { TrustService } from './trust.service';

/**
 * Account standing. Imported by every module that can record a strike
 * (bookings, reports) and by auth, which is where a ban is enforced.
 */
@Module({
  providers: [TrustService],
  exports: [TrustService],
})
export class TrustModule {}

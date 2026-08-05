import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { GeoModule } from '../geo/geo.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { AuthModule } from '../auth/auth.module';
import { MatchingService } from './matching.service';
import { MatchingProcessor } from './matching.processor';
import { MatchingController } from './matching.controller';

@Module({
  imports: [JobsModule, GeoModule, RealtimeModule, AuthModule],
  controllers: [MatchingController],
  providers: [MatchingService, MatchingProcessor],
  exports: [MatchingService],
})
export class MatchingModule {}

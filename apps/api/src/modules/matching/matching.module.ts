import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { GeoModule } from '../geo/geo.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { AuthModule } from '../auth/auth.module';
import { MatchingService } from './matching.service';
import { MatchingProcessor } from './matching.processor';
import { MatchingController } from './matching.controller';
import { DevSimulateController } from './dev-simulate.controller';

@Module({
  imports: [JobsModule, GeoModule, RealtimeModule, AuthModule],
  controllers: [MatchingController, DevSimulateController],
  providers: [MatchingService, MatchingProcessor],
})
export class MatchingModule {}

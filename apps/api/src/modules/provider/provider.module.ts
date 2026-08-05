import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { MatchingModule } from '../matching/matching.module';
import { ProviderService } from './provider.service';
import { ProviderController } from './provider.controller';
import { ProviderGuard } from './provider.guard';

@Module({
  imports: [AuthModule, RealtimeModule, MatchingModule],
  controllers: [ProviderController],
  providers: [ProviderService, ProviderGuard],
})
export class ProviderModule {}

import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { AdminOverviewController } from './admin-overview.controller';
import { AdminOverviewService } from './admin-overview.service';

@Module({
  imports: [AdminAuthModule],
  controllers: [AdminOverviewController],
  providers: [AdminOverviewService],
})
export class AdminOverviewModule {}

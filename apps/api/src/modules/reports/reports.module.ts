import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TrustModule } from '../trust/trust.module';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';

@Module({
  imports: [AuthModule, TrustModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}

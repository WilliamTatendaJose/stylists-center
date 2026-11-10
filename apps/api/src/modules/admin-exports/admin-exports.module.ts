import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { AdminExportsController } from './admin-exports.controller';
import { AdminExportsService } from './admin-exports.service';

@Module({
  imports: [AdminAuthModule],
  controllers: [AdminExportsController],
  providers: [AdminExportsService],
})
export class AdminExportsModule {}

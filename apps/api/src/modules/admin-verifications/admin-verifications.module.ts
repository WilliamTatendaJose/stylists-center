import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { AdminVerificationsController } from './admin-verifications.controller';
import { AdminVerificationsService } from './admin-verifications.service';

@Module({
  imports: [AdminAuthModule],
  controllers: [AdminVerificationsController],
  providers: [AdminVerificationsService],
})
export class AdminVerificationsModule {}

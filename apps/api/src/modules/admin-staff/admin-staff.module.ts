import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { AdminStaffController } from './admin-staff.controller';
import { AdminStaffService } from './admin-staff.service';

@Module({
  imports: [AdminAuthModule],
  controllers: [AdminStaffController],
  providers: [AdminStaffService],
})
export class AdminStaffModule {}

import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { AdminPaymentsController } from './admin-payments.controller';
import { AdminPaymentsService } from './admin-payments.service';

@Module({
  imports: [AdminAuthModule],
  controllers: [AdminPaymentsController],
  providers: [AdminPaymentsService],
})
export class AdminPaymentsModule {}

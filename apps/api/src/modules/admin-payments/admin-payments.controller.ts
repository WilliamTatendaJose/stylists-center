import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AdminJwtAuthGuard } from '../admin-auth/admin-jwt-auth.guard';
import { AdminPaymentsService } from './admin-payments.service';
import { RecordPayoutDto } from './dto';

@Controller('admin/payments')
@UseGuards(AdminJwtAuthGuard)
export class AdminPaymentsController {
  constructor(private readonly adminPayments: AdminPaymentsService) {}

  @Get('overview')
  overview() {
    return this.adminPayments.overview();
  }

  @Get('providers')
  providerPayouts() {
    return this.adminPayments.providerPayouts();
  }

  @Post('providers/:providerId/payouts')
  recordPayout(@Param('providerId') providerId: string, @Body() dto: RecordPayoutDto) {
    return this.adminPayments.recordPayout(providerId, dto);
  }
}

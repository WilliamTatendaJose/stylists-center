import { Body, Controller, Get, Param, Post, UseGuards, Query } from '@nestjs/common';
import { AdminJwtAuthGuard } from '../admin-auth/admin-jwt-auth.guard';
import { AdminPaymentsService } from './admin-payments.service';
import { RecordPayoutDto } from './dto';
import { AdminRoles } from '../admin-auth/admin-roles';
import { readPage, searchTerm } from '../../common/paging';

@AdminRoles('finance')
@Controller('admin/payments')
@UseGuards(AdminJwtAuthGuard)
export class AdminPaymentsController {
  constructor(private readonly adminPayments: AdminPaymentsService) {}

  @Get('overview')
  overview() {
    return this.adminPayments.overview();
  }

  @Get('providers')
  providerPayouts(
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.adminPayments.providerPayouts({ q: searchTerm(q), page: readPage(limit, offset) });
  }

  @Post('providers/:providerId/payouts')
  recordPayout(@Param('providerId') providerId: string, @Body() dto: RecordPayoutDto) {
    return this.adminPayments.recordPayout(providerId, dto);
  }
}

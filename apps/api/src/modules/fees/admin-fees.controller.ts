import { Body, Controller, Get, Header, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';
import { adjustFeesSchema, recordFeePaymentSchema } from '@sc/shared';
import { readPage, searchTerm } from '../../common/paging';
import { AdminRoles } from '../admin-auth/admin-roles';
import {
  AdminJwtAuthGuard,
  type AdminAuthenticatedRequest,
} from '../admin-auth/admin-jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { AdminFeesService, type FeeListFilter } from './admin-fees.service';

class RecordFeePaymentDto extends createZodDto(recordFeePaymentSchema) {}
class AdjustFeesDto extends createZodDto(adjustFeesSchema) {}

function parseFilter(value?: string): FeeListFilter | undefined {
  return value === 'owing' || value === 'overdue' || value === 'restricted' ? value : undefined;
}

@AdminRoles('finance')
@Controller('admin/fees')
@UseGuards(AdminJwtAuthGuard)
export class AdminFeesController {
  constructor(
    private readonly adminFees: AdminFeesService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  list(
    @Query('q') q?: string,
    @Query('filter') filter?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.adminFees.list({
      q: searchTerm(q),
      filter: parseFilter(filter),
      page: readPage(limit, offset),
    });
  }

  @Get('summary')
  summary() {
    return this.adminFees.summary();
  }

  @Get('export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="fee-balances.csv"')
  @Header('Cache-Control', 'no-store')
  async exportCsv(@Req() req: AdminAuthenticatedRequest) {
    const csv = await this.adminFees.csv();
    // Same as the other exports: reads aren't audited, but a bulk export of names and phone numbers is.
    await this.prisma.auditLog.create({
      data: {
        adminActorId: req.admin?.id ?? null,
        action: 'EXPORT fee-balances',
        ip: req.ip ?? null,
      },
    });
    return csv;
  }

  @Get(':providerId')
  detail(@Param('providerId') providerId: string) {
    return this.adminFees.detail(providerId);
  }

  @Post(':providerId/payments')
  recordPayment(
    @Param('providerId') providerId: string,
    @Body() dto: RecordFeePaymentDto,
    @Req() req: AdminAuthenticatedRequest,
  ) {
    return this.adminFees.recordPayment(req.admin?.id ?? '', providerId, dto);
  }

  @Post(':providerId/adjustments')
  adjust(
    @Param('providerId') providerId: string,
    @Body() dto: AdjustFeesDto,
    @Req() req: AdminAuthenticatedRequest,
  ) {
    return this.adminFees.adjust(req.admin?.id ?? '', providerId, dto);
  }
}

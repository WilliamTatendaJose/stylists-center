import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { appealStatusSchema, reportStatusSchema } from '@sc/shared';
import { AdminJwtAuthGuard } from '../admin-auth/admin-jwt-auth.guard';
import { AdminTrustService } from './admin-trust.service';
import { CreateManualBanDto, ResolveAppealDto, UpdateReportStatusDto } from './dto';

@Controller('admin')
@UseGuards(AdminJwtAuthGuard)
export class AdminTrustController {
  constructor(private readonly adminTrust: AdminTrustService) {}

  @Get('reports')
  listReports(@Query('status') status?: string) {
    return this.adminTrust.listReports(reportStatusSchema.safeParse(status).data);
  }

  @Get('reports/:id')
  getReport(@Param('id') id: string) {
    return this.adminTrust.getReport(id);
  }

  @Patch('reports/:id')
  updateReportStatus(@Param('id') id: string, @Body() dto: UpdateReportStatusDto) {
    return this.adminTrust.updateReportStatus(id, dto.status, dto.resolutionNote);
  }

  @Get('bans')
  listBans(@Query('appealStatus') appealStatus?: string) {
    return this.adminTrust.listBans(appealStatusSchema.safeParse(appealStatus).data);
  }

  @Get('bans/:id')
  getBan(@Param('id') id: string) {
    return this.adminTrust.getBan(id);
  }

  @Post('bans')
  createManualBan(@Body() dto: CreateManualBanDto) {
    return this.adminTrust.createManualBan(dto.userId, dto.reason);
  }

  @Patch('bans/:id')
  resolveAppeal(@Param('id') id: string, @Body() dto: ResolveAppealDto) {
    return this.adminTrust.resolveAppeal(id, dto.appealStatus, dto.appealNote);
  }
}

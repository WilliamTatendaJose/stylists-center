import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminJwtAuthGuard } from '../admin-auth/admin-jwt-auth.guard';
import { AdminAuditService } from './admin-audit.service';

@Controller('admin/audit-log')
@UseGuards(AdminJwtAuthGuard)
export class AdminAuditController {
  constructor(private readonly adminAudit: AdminAuditService) {}

  @Get()
  list(@Query('limit') limit?: string) {
    return this.adminAudit.list(limit ? Number(limit) : undefined);
  }
}

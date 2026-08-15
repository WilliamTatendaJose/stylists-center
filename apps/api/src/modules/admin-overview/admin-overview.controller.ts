import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminJwtAuthGuard } from '../admin-auth/admin-jwt-auth.guard';
import { AdminOverviewService } from './admin-overview.service';

@Controller('admin/overview')
@UseGuards(AdminJwtAuthGuard)
export class AdminOverviewController {
  constructor(private readonly adminOverview: AdminOverviewService) {}

  @Get()
  get() {
    return this.adminOverview.get();
  }

  @Get('trends')
  trends() {
    return this.adminOverview.trends();
  }
}

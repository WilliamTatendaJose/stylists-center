import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { AdminJwtAuthGuard } from '../admin-auth/admin-jwt-auth.guard';
import {
  AdminVerificationsService,
  parseVerificationStatus,
} from './admin-verifications.service';
import { ReviewVerificationDto } from './dto';

@Controller('admin/verifications')
@UseGuards(AdminJwtAuthGuard)
export class AdminVerificationsController {
  constructor(private readonly verifications: AdminVerificationsService) {}

  @Get()
  list(@Query('status') status?: string) {
    return this.verifications.list(parseVerificationStatus(status));
  }

  @Patch(':id')
  review(@Param('id') id: string, @Body() dto: ReviewVerificationDto) {
    return this.verifications.review(id, dto);
  }
}

import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { AdminJwtAuthGuard } from '../admin-auth/admin-jwt-auth.guard';
import { AdminVerificationsService, parseVerificationStatus } from './admin-verifications.service';
import { ReviewVerificationDto } from './dto';
import { AdminRoles } from '../admin-auth/admin-roles';
import { readPage, searchTerm } from '../../common/paging';

@AdminRoles('support')
@Controller('admin/verifications')
@UseGuards(AdminJwtAuthGuard)
export class AdminVerificationsController {
  constructor(private readonly verifications: AdminVerificationsService) {}

  @Get()
  list(
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.verifications.list({
      status: parseVerificationStatus(status),
      q: searchTerm(q),
      page: readPage(limit, offset),
    });
  }

  @Patch(':id')
  review(@Param('id') id: string, @Body() dto: ReviewVerificationDto) {
    return this.verifications.review(id, dto);
  }
}

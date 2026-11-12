import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';
import { reviewVendorSchema } from '@sc/shared';
import { AdminJwtAuthGuard } from '../admin-auth/admin-jwt-auth.guard';
import { AdminRoles } from '../admin-auth/admin-roles';
import { CurrentAdmin } from '../admin-auth/current-admin.decorator';
import { readPage, searchTerm } from '../../common/paging';
import { AdminVendorsService, parseVendorStatus } from './admin-vendors.service';

class ReviewVendorDto extends createZodDto(reviewVendorSchema) {}

/** Support decides who may sell, the same desk that verifies identities. */
@AdminRoles('support')
@Controller('admin/vendors')
@UseGuards(AdminJwtAuthGuard)
export class AdminVendorsController {
  constructor(private readonly vendors: AdminVendorsService) {}

  @Get()
  list(
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.vendors.list({
      status: parseVendorStatus(status),
      q: searchTerm(q),
      page: readPage(limit, offset),
    });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.vendors.get(id);
  }

  @Patch(':id')
  review(
    @Param('id') id: string,
    @CurrentAdmin() admin: { id: string },
    @Body() dto: ReviewVendorDto,
  ) {
    return this.vendors.review(id, admin.id, dto);
  }
}

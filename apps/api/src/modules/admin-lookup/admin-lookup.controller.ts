import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AdminJwtAuthGuard } from '../admin-auth/admin-jwt-auth.guard';
import { AdminLookupService } from './admin-lookup.service';

@Controller('admin/lookup')
@UseGuards(AdminJwtAuthGuard)
export class AdminLookupController {
  constructor(private readonly adminLookup: AdminLookupService) {}

  @Get()
  search(@Query('q') q = '') {
    return this.adminLookup.search(q);
  }

  @Get('bookings/:id')
  getBooking(@Param('id') id: string) {
    return this.adminLookup.getBooking(id);
  }

  @Get('orders/:id')
  getOrder(@Param('id') id: string) {
    return this.adminLookup.getOrder(id);
  }
}

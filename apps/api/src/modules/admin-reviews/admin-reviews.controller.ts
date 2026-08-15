import { Controller, Delete, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AdminJwtAuthGuard } from '../admin-auth/admin-jwt-auth.guard';
import { AdminReviewsService } from './admin-reviews.service';

@Controller('admin/reviews')
@UseGuards(AdminJwtAuthGuard)
export class AdminReviewsController {
  constructor(private readonly adminReviews: AdminReviewsService) {}

  @Get()
  list(@Query('limit') limit?: string) {
    return this.adminReviews.list(limit ? Number(limit) : undefined);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.adminReviews.delete(id);
  }
}

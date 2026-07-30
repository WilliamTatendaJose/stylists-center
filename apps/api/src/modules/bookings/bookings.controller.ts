import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { BookingsService } from './bookings.service';
import { CreateBookingDto, CreateReviewDto } from './dto';

@Controller('bookings')
@UseGuards(JwtAuthGuard)
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Post()
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateBookingDto) {
    return this.bookings.create(user.id, dto);
  }

  @Get()
  list(@CurrentUser() user: { id: string }) {
    return this.bookings.listForClient(user.id);
  }

  @Post(':id/confirm-completion')
  confirmCompletion(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.bookings.confirmCompletion(id, user.id);
  }

  @Post(':id/reviews')
  review(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateReviewDto,
  ) {
    return this.bookings.createReview(id, user.id, dto);
  }
}

import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { MatchingService } from './matching.service';
import { CreateMatchRequestDto } from './dto';

@Controller('matches')
@UseGuards(JwtAuthGuard)
export class MatchingController {
  constructor(private readonly matching: MatchingService) {}

  @Post()
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateMatchRequestDto) {
    return this.matching.createMatch(user.id, dto);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.matching.getMatch(id);
  }

  @Post(':id/retry')
  retry(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.matching.retry(id, user.id);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.matching.cancel(id, user.id);
  }
}

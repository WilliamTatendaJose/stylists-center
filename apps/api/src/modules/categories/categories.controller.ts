import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CategoriesService } from './categories.service';
import { CategoriesQueryDto } from './dto';

/** Signed-in only — `nearbyCount` is a live density map of where providers are. */
@Controller('categories')
@UseGuards(JwtAuthGuard)
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  list(@Query() query: CategoriesQueryDto) {
    return this.categories.list(query.lat, query.lng, query.radiusKm);
  }
}

import { Controller, Get, Query } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CategoriesQueryDto } from './dto';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  list(@Query() query: CategoriesQueryDto) {
    return this.categories.list(query.lat, query.lng, query.radiusKm);
  }
}

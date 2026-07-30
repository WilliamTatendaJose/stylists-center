import { Controller, Get, Query } from '@nestjs/common';
import { GeoService } from './geo.service';
import { GeoSearchQueryDto, GeoRouteQueryDto } from './dto';

@Controller('geo')
export class GeoController {
  constructor(private readonly geo: GeoService) {}

  @Get('search')
  search(@Query() query: GeoSearchQueryDto) {
    return this.geo.search(query.lat, query.lng, query.radiusKm, query.categoryId);
  }

  @Get('route')
  route(@Query() query: GeoRouteQueryDto) {
    return this.geo.route(query.providerId, query.lat, query.lng);
  }
}

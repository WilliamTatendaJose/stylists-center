import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GeoService } from './geo.service';
import { GeoSearchQueryDto, GeoRouteQueryDto } from './dto';

/** Signed-in only — /search returns map pins for every provider in a radius. */
@Controller('geo')
@UseGuards(JwtAuthGuard)
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

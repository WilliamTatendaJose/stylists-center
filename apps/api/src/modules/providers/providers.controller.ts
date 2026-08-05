import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ProvidersService } from './providers.service';
import { CreateProviderProfileDto, LatLngQueryDto, ProviderSearchQueryDto, SlotsQueryDto } from './dto';

/**
 * Signed-in only. These endpoints return every stylist's name, area, rating
 * and position, so leaving them open let anyone enumerate the entire provider
 * catalogue — and the people in it are largely working from home.
 */
@Controller('providers')
@UseGuards(JwtAuthGuard)
export class ProvidersController {
  constructor(private readonly providers: ProvidersService) {}

  @Post()
  createMyProfile(@CurrentUser() user: { id: string }, @Body() dto: CreateProviderProfileDto) {
    return this.providers.createMyProfile(user.id, dto);
  }

  // Declared before ':id' — Express/Nest routing matches in registration
  // order, so these must come first or ':id' would swallow "/available"
  // and "/search".
  @Get('available')
  available(@Query() query: LatLngQueryDto) {
    return this.providers.listAvailable({
      lat: query.lat,
      lng: query.lng,
      radiusKm: query.radiusKm ?? null,
      limit: query.limit,
      offset: query.offset,
    });
  }

  @Get('search')
  search(@Query() query: ProviderSearchQueryDto) {
    return this.providers.search({
      query: query.q,
      lat: query.lat,
      lng: query.lng,
      radiusKm: query.radiusKm ?? null,
      limit: query.limit,
      offset: query.offset,
    });
  }

  @Get(':id')
  getById(@Param('id') id: string, @Query() query: LatLngQueryDto) {
    return this.providers.getById(id, query.lat, query.lng);
  }

  @Get(':id/slots')
  getSlots(@Param('id') id: string, @Query() query: SlotsQueryDto) {
    return this.providers.getSlots(id, query.date);
  }
}

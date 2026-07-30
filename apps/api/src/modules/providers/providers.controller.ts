import { Controller, Get, Param, Query } from '@nestjs/common';
import { ProvidersService } from './providers.service';
import { LatLngQueryDto, SlotsQueryDto } from './dto';

@Controller('providers')
export class ProvidersController {
  constructor(private readonly providers: ProvidersService) {}

  // Declared before ':id' — Express/Nest routing matches in registration
  // order, so this must come first or ':id' would swallow "/available".
  @Get('available')
  available(@Query() query: LatLngQueryDto) {
    return this.providers.listAvailable(query.lat, query.lng);
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

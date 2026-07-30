import { Module } from '@nestjs/common';
import { GeoRepository } from './geo.repository';
import { GeoService } from './geo.service';
import { GeoController } from './geo.controller';

@Module({
  controllers: [GeoController],
  providers: [GeoRepository, GeoService],
  exports: [GeoRepository],
})
export class GeoModule {}

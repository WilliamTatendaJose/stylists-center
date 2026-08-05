import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GeoRepository } from './geo.repository';
import { GeoService } from './geo.service';
import { GeoController } from './geo.controller';

@Module({
  imports: [AuthModule],
  controllers: [GeoController],
  providers: [GeoRepository, GeoService],
  exports: [GeoRepository],
})
export class GeoModule {}

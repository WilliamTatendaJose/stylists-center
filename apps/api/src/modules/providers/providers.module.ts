import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GeoModule } from '../geo/geo.module';
import { ProvidersService } from './providers.service';
import { ProvidersController } from './providers.controller';

@Module({
  imports: [AuthModule, GeoModule],
  controllers: [ProvidersController],
  providers: [ProvidersService],
})
export class ProvidersModule {}

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GeoModule } from '../geo/geo.module';
import { CategoriesService } from './categories.service';
import { CategoriesController } from './categories.controller';

@Module({
  imports: [AuthModule, GeoModule],
  controllers: [CategoriesController],
  providers: [CategoriesService],
})
export class CategoriesModule {}

import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { AdminReviewsController } from './admin-reviews.controller';
import { AdminReviewsService } from './admin-reviews.service';

@Module({
  imports: [AdminAuthModule],
  controllers: [AdminReviewsController],
  providers: [AdminReviewsService],
})
export class AdminReviewsModule {}

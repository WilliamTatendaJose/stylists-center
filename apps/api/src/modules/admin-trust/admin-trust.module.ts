import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { TrustModule } from '../trust/trust.module';
import { AdminTrustController } from './admin-trust.controller';
import { AdminTrustService } from './admin-trust.service';

@Module({
  imports: [AdminAuthModule, TrustModule],
  controllers: [AdminTrustController],
  providers: [AdminTrustService],
})
export class AdminTrustModule {}

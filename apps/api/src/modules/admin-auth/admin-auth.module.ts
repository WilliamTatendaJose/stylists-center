import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthService } from './admin-auth.service';
import { AdminJwtAuthGuard } from './admin-jwt-auth.guard';

@Module({
  // Registered with no default secret/options, same reasoning as AuthModule:
  // every sign/verify call passes ADMIN_JWT_ACCESS_SECRET explicitly.
  imports: [JwtModule.register({})],
  controllers: [AdminAuthController],
  providers: [AdminAuthService, AdminJwtAuthGuard],
  exports: [AdminAuthService, AdminJwtAuthGuard],
})
export class AdminAuthModule {}

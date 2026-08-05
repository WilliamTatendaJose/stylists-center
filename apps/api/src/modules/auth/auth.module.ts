import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TrustModule } from '../trust/trust.module';
import { AuthController, MeController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@Module({
  // Registered with no default secret/options: every sign/verify call in
  // AuthService passes JWT_ACCESS_SECRET explicitly via ConfigService, so a
  // module-level secret would just be dead configuration.
  imports: [JwtModule.register({}), TrustModule],
  controllers: [AuthController, MeController],
  providers: [AuthService, JwtAuthGuard],
  exports: [AuthService, JwtAuthGuard],
})
export class AuthModule {}

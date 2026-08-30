import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TrustModule } from '../trust/trust.module';
import { AuthController, MeController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { ImageStorageService } from '../provider/image-storage.service';
import { FirebaseIdentityService } from './firebase-identity.service';
import { UserLifecycleService } from './user-lifecycle.service';

@Module({
  // Registered with no default secret/options: every sign/verify call in
  // AuthService passes JWT_ACCESS_SECRET explicitly via ConfigService, so a
  // module-level secret would just be dead configuration.
  imports: [JwtModule.register({}), TrustModule],
  controllers: [AuthController, MeController],
  providers: [
    AuthService,
    FirebaseIdentityService,
    UserLifecycleService,
    JwtAuthGuard,
    ImageStorageService,
  ],
  exports: [AuthService, FirebaseIdentityService, UserLifecycleService, JwtAuthGuard],
})
export class AuthModule {}

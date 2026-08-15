import { Body, Controller, Get, Ip, Patch, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';
import { ImageStorageService, MAX_IMAGE_BYTES, type UploadedImageFile } from '../provider/image-storage.service';
import {
  RequestOtpDto,
  VerifyOtpDto,
  RefreshDto,
  SetActiveRoleDto,
  UpdateProfileDto,
  RegisterPushTokenDto,
  VerificationSubmissionDto,
} from './dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('otp/request')
  requestOtp(@Body() dto: RequestOtpDto, @Ip() ip: string) {
    return this.auth.requestOtp(dto.phone, ip, dto.channel);
  }

  @Post('otp/verify')
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.auth.verifyOtp(dto.challengeId, dto.code);
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }
}

@Controller('me')
export class MeController {
  constructor(
    private readonly auth: AuthService,
    private readonly images: ImageStorageService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  me(@CurrentUser() user: { id: string }) {
    return this.auth.me(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('role')
  setRole(@CurrentUser() user: { id: string }, @Body() dto: SetActiveRoleDto) {
    return this.auth.setActiveRole(user.id, dto.role);
  }

  @UseGuards(JwtAuthGuard)
  @Patch()
  updateProfile(@CurrentUser() user: { id: string }, @Body() dto: UpdateProfileDto) {
    return this.auth.updateProfile(user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('images')
  @UseInterceptors(FileInterceptor('image', { limits: { files: 1, fileSize: MAX_IMAGE_BYTES } }))
  uploadImage(@UploadedFile() file: UploadedImageFile | undefined) {
    return this.images.save(file);
  }

  @UseGuards(JwtAuthGuard)
  @Post('push-token')
  registerPushToken(@CurrentUser() user: { id: string }, @Body() dto: RegisterPushTokenDto) {
    return this.auth.registerPushToken(user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('verification')
  verification(@CurrentUser() user: { id: string }) {
    return this.auth.getVerification(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('verification')
  submitVerification(
    @CurrentUser() user: { id: string },
    @Body() dto: VerificationSubmissionDto,
  ) {
    return this.auth.submitVerification(user.id, dto);
  }
}

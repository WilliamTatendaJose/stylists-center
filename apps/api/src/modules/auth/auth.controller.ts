import { Body, Controller, Get, Ip, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';
import { RequestOtpDto, VerifyOtpDto, RefreshDto, SetActiveRoleDto } from './dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('otp/request')
  requestOtp(@Body() dto: RequestOtpDto, @Ip() ip: string) {
    return this.auth.requestOtp(dto.phone, ip);
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
  constructor(private readonly auth: AuthService) {}

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
}

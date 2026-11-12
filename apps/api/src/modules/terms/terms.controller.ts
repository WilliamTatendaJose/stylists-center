import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import type { TermsDocumentStatusDto } from '@sc/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AcceptTermsDto } from './dto';
import { TermsService } from './terms.service';

@Controller('terms')
@UseGuards(JwtAuthGuard)
export class TermsController {
  constructor(private readonly terms: TermsService) {}

  @Get('status')
  status(@CurrentUser() user: { id: string }): Promise<TermsDocumentStatusDto[]> {
    return this.terms.status(user.id);
  }

  @Post('accept')
  accept(
    @CurrentUser() user: { id: string },
    @Body() dto: AcceptTermsDto,
  ): Promise<TermsDocumentStatusDto[]> {
    return this.terms.accept(user.id, dto);
  }
}

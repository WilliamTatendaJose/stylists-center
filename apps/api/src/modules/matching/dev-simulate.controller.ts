import { Body, Controller, NotFoundException, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import { MatchingService } from './matching.service';
import { SimulateAcceptOfferDto } from './dto';

/**
 * Dev-only test harness (plan §9): stands in for a real provider client
 * accepting a smart-match offer, since M1's mobile scope has no provider-side
 * "incoming request" screen to exercise this for real. 404s (not just
 * unauthorized) in production so the route's existence isn't even visible.
 */
@Controller('dev/simulate')
export class DevSimulateController {
  constructor(
    private readonly matching: MatchingService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Post('accept-offer')
  acceptOffer(@Body() dto: SimulateAcceptOfferDto) {
    if (this.config.get('NODE_ENV', { infer: true }) === 'production') {
      throw new NotFoundException();
    }
    return this.matching.simulateAcceptOffer(dto.matchId, dto.providerId);
  }
}

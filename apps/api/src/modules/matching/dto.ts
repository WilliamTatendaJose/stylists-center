import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { createMatchRequestSchema } from '@sc/shared';

export class CreateMatchRequestDto extends createZodDto(createMatchRequestSchema) {}

export const simulateAcceptOfferSchema = z.object({
  matchId: z.uuid(),
  providerId: z.uuid().optional(),
});
export class SimulateAcceptOfferDto extends createZodDto(simulateAcceptOfferSchema) {}

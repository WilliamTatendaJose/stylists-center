import { z } from 'zod';
import { RADIUS_LADDER_KM, isValidBudgetAmount, MATCH_STATES } from '../domain/index.js';

const radiusKmSchema = z.union(
  RADIUS_LADDER_KM.map((km) => z.literal(km)) as [z.ZodLiteral<number>, ...z.ZodLiteral<number>[]],
);

const budgetSchema = z
  .discriminatedUnion('mode', [
    z.object({ mode: z.literal('flex') }),
    z.object({ mode: z.literal('fixed'), amountUsd: z.number() }),
  ])
  .refine((b) => b.mode === 'flex' || isValidBudgetAmount(b.amountUsd), {
    message: 'amountUsd must be 10-120 in steps of 5',
  });

export const latLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const createMatchRequestSchema = z.object({
  categoryId: z.uuid(),
  budget: budgetSchema,
  radiusKm: radiusKmSchema,
  location: latLngSchema,
});
export type CreateMatchRequestInput = z.infer<typeof createMatchRequestSchema>;

export const matchStateSchema = z.enum(MATCH_STATES);

export const matchOfferSchema = z.object({
  id: z.uuid(),
  providerId: z.uuid(),
  displayName: z.string(),
  tint: z.string(),
  initials: z.string(),
  verified: z.boolean(),
  ratingAvg: z.number(),
  completedCount: z.number().int(),
  quoteUsdCents: z.number().int(),
});
export type MatchOfferDto = z.infer<typeof matchOfferSchema>;

export const matchRequestSchema = z.object({
  id: z.uuid(),
  state: matchStateSchema,
  attempt: z.number().int().min(1),
  radiusKm: radiusKmSchema,
  budget: budgetSchema,
  expiresAt: z.iso.datetime(),
  fanOutCount: z.number().int(),
  offers: z.array(matchOfferSchema),
});
export type MatchRequestDto = z.infer<typeof matchRequestSchema>;

export const createMatchRequestResponseSchema = z.object({
  id: z.uuid(),
  state: matchStateSchema,
  expiresAt: z.iso.datetime(),
  fanOutCount: z.number().int(),
});
export type CreateMatchRequestResponse = z.infer<typeof createMatchRequestResponseSchema>;

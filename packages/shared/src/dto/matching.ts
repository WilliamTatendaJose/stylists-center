import { z } from 'zod';
import {
  isMatchRadiusKm,
  MATCH_STATES,
  MAX_MATCH_RADIUS_KM,
  MIN_MATCH_RADIUS_KM,
} from '../domain/index.js';

const radiusKmSchema = z.number().refine(isMatchRadiusKm, {
  message: `radiusKm must be between ${String(MIN_MATCH_RADIUS_KM)} and ${String(MAX_MATCH_RADIUS_KM)}`,
});

const budgetSchema = z
  .discriminatedUnion('mode', [
    z.object({ mode: z.literal('flex') }),
    z.object({ mode: z.literal('fixed'), amountUsd: z.number() }),
  ])
  // Shape and sanity only: the allowed range and step are settings that staff
  // can change, so the API checks the amount against the settings in effect
  // (isBudgetAmountAllowed). A stored request made under older settings must
  // still parse here.
  .refine(
    (b) =>
      b.mode === 'flex' ||
      (Number.isInteger(b.amountUsd) && b.amountUsd > 0 && b.amountUsd <= 10_000),
    {
      message: 'amountUsd must be a whole number of dollars',
    },
  );

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

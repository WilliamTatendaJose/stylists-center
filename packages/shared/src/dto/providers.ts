import { z } from 'zod';
import { latLngSchema } from './matching.js';

export const categorySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  nearbyCount: z.number().int(),
});
export type CategoryDto = z.infer<typeof categorySchema>;

export const providerListRowSchema = z.object({
  id: z.uuid(),
  displayName: z.string(),
  tint: z.string(),
  initials: z.string(),
  verified: z.boolean(),
  categoryName: z.string(),
  areaName: z.string(),
  ratingAvg: z.number(),
  completedCount: z.number().int(),
  fromPriceUsdCents: z.number().int(),
  distanceKm: z.number(),
});
export type ProviderListRowDto = z.infer<typeof providerListRowSchema>;

export const serviceSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  durationMinutes: z.number().int(),
  priceUsdCents: z.number().int(),
});
export type ServiceDto = z.infer<typeof serviceSchema>;

export const reviewSchema = z.object({
  id: z.uuid(),
  authorName: z.string(),
  rating: z.number(),
  text: z.string(),
});
export type ReviewDto = z.infer<typeof reviewSchema>;

export const providerProfileSchema = z.object({
  id: z.uuid(),
  displayName: z.string(),
  tint: z.string(),
  initials: z.string(),
  verified: z.boolean(),
  categoryName: z.string(),
  areaName: z.string(),
  distanceKm: z.number(),
  ratingAvg: z.number(),
  completedCount: z.number().int(),
  yearsExperience: z.number().int(),
  portfolioImageUrls: z.array(z.string()).max(5),
  /** 'list' shows the full priced service menu; 'from' shows a single "from $X" panel. */
  priceDisplay: z.enum(['list', 'from']),
  services: z.array(serviceSchema),
  fromPriceUsdCents: z.number().int().optional(),
  reviews: z.array(reviewSchema),
  workingHoursLabel: z.string(),
});
export type ProviderProfileDto = z.infer<typeof providerProfileSchema>;

export const slotSchema = z.object({
  time: z.string(), // "08:00"
  available: z.boolean(),
});
export type SlotDto = z.infer<typeof slotSchema>;

export const providerSlotsResponseSchema = z.object({
  date: z.string(), // "2026-07-30"
  slots: z.array(slotSchema),
});
export type ProviderSlotsResponse = z.infer<typeof providerSlotsResponseSchema>;

export const geoSearchQuerySchema = z.object({
  location: latLngSchema,
  radiusKm: z.number().positive(),
  categoryId: z.uuid().optional(),
});
export type GeoSearchQuery = z.infer<typeof geoSearchQuerySchema>;

export const geoPinSchema = z.object({
  id: z.uuid(),
  displayName: z.string(),
  initials: z.string(),
  location: latLngSchema,
});
export type GeoPinDto = z.infer<typeof geoPinSchema>;

export const geoSearchResponseSchema = z.object({
  pins: z.array(geoPinSchema),
  list: z.array(providerListRowSchema),
});
export type GeoSearchResponse = z.infer<typeof geoSearchResponseSchema>;

export const routeStepSchema = z.object({
  distanceLabel: z.string(),
  text: z.string(),
});
export type RouteStepDto = z.infer<typeof routeStepSchema>;

export const routeResponseSchema = z.object({
  distanceKm: z.number(),
  etaMinutes: z.number().int(),
  kombiFareUsdCents: z.number().int(),
  steps: z.array(routeStepSchema),
});
export type RouteResponse = z.infer<typeof routeResponseSchema>;

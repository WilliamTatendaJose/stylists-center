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
  /** Whether the provider is taking work right now — search returns unavailable stylists, so rows must be able to say so. */
  acceptingBookings: z.boolean(),
  categoryName: z.string(),
  areaName: z.string(),
  ratingAvg: z.number(),
  completedCount: z.number().int(),
  fromPriceUsdCents: z.number().int(),
  distanceKm: z.number(),
});
export type ProviderListRowDto = z.infer<typeof providerListRowSchema>;

/**
 * A page of providers. `nextOffset` is null on the last page — the client
 * never has to guess whether one more request is worth the data.
 */
export const providerPageSchema = z.object({
  items: z.array(providerListRowSchema),
  nextOffset: z.number().int().nullable(),
});
export type ProviderPageDto = z.infer<typeof providerPageSchema>;

/** Page size for the provider lists. Enough to fill a phone screen and scroll a little, not a whole catalogue. */
export const PROVIDER_PAGE_SIZE = 20;

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
  /**
   * Where the route ends — the provider's coordinates. Carried on the route
   * rather than the provider profile because it is the route's own subject,
   * and because it keeps the map screens to a single request. Until this
   * existed the Directions and Trip screens had no server-side source for the
   * destination pin and fell back to a hardcoded fixture table.
   */
  destination: latLngSchema,
  /**
   * The real road-following path, [lng, lat] pairs in travel order, from the
   * routing engine — what the map actually draws. Falls back to just
   * [origin, destination] (a straight line) when the routing engine couldn't
   * be reached, so the screen still renders a route rather than nothing.
   */
  coordinates: z.array(z.tuple([z.number(), z.number()])),
});
export type RouteResponse = z.infer<typeof routeResponseSchema>;

export const createServiceInputSchema = z.object({
  name: z.string().trim().min(2).max(60),
  durationMinutes: z.number().int().min(10).max(480),
  priceUsdCents: z.number().int().min(100).max(100_000),
});
export type CreateServiceInput = z.infer<typeof createServiceInputSchema>;

/**
 * The minimum a stylist page needs to be bookable: a category, an area, at
 * least one priced service, and honest hours. Verification (ID + selfie) is
 * a separate, later step this does not cover.
 */
export const createProviderProfileSchema = z.object({
  categoryId: z.uuid(),
  areaName: z.string().trim().min(2).max(60),
  workingHoursLabel: z.string().trim().min(2).max(80),
  yearsExperience: z.number().int().min(0).max(60).default(0),
  ...latLngSchema.shape,
  services: z.array(createServiceInputSchema).min(1).max(20),
});
export type CreateProviderProfileInput = z.infer<typeof createProviderProfileSchema>;

export const createProviderProfileResponseSchema = z.object({ id: z.uuid() });
export type CreateProviderProfileResponse = z.infer<typeof createProviderProfileResponseSchema>;

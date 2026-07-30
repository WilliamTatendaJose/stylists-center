import { z } from 'zod';
import { latLngSchema } from './matching.js';

export const startTripResponseSchema = z.object({
  tripId: z.uuid(),
});
export type StartTripResponse = z.infer<typeof startTripResponseSchema>;

export const reportTripLocationSchema = latLngSchema;
export type ReportTripLocationInput = z.infer<typeof reportTripLocationSchema>;

export const tripStateSchema = z.object({
  tripId: z.uuid(),
  mode: z.enum(['client', 'provider']),
  arrived: z.boolean(),
  etaShared: z.boolean(),
  etaMinutes: z.number().int(),
  distanceKmRemaining: z.number(),
});
export type TripStateDto = z.infer<typeof tripStateSchema>;

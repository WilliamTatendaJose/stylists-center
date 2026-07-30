import { z } from 'zod';

/**
 * Auth DTOs (SRS auth flow, plan §6). Fed into NestJS via nestjs-zod on the
 * API side and used directly for client-side form validation — this is the
 * single source that keeps the two surfaces from drifting.
 */

export const requestOtpSchema = z.object({
  /** Any format libphonenumber-js can parse against the ZW default region. */
  phone: z.string().min(6).max(20),
});
export type RequestOtpInput = z.infer<typeof requestOtpSchema>;

export const requestOtpResponseSchema = z.object({
  challengeId: z.uuid(),
  expiresAt: z.iso.datetime(),
});
export type RequestOtpResponse = z.infer<typeof requestOtpResponseSchema>;

export const verifyOtpSchema = z.object({
  challengeId: z.uuid(),
  code: z
    .string()
    .length(6)
    .regex(/^\d{6}$/),
});
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;

export const authTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});
export type AuthTokens = z.infer<typeof authTokensSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string(),
});
export type RefreshInput = z.infer<typeof refreshSchema>;

export const activeRoleSchema = z.enum(['client', 'provider']);
export type ActiveRole = z.infer<typeof activeRoleSchema>;

export const setActiveRoleSchema = z.object({
  role: activeRoleSchema,
});
export type SetActiveRoleInput = z.infer<typeof setActiveRoleSchema>;

export const meSchema = z.object({
  id: z.uuid(),
  phone: z.string(),
  displayName: z.string(),
  activeRole: activeRoleSchema,
  hasProviderProfile: z.boolean(),
  verificationStatus: z.enum(['unverified', 'pending', 'verified']),
});
export type Me = z.infer<typeof meSchema>;

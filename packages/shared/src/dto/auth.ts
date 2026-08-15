import { z } from 'zod';
import { imageUrlSchema } from './uploads.js';

/**
 * Auth DTOs (SRS auth flow, plan §6). Fed into NestJS via nestjs-zod on the
 * API side and used directly for client-side form validation — this is the
 * single source that keeps the two surfaces from drifting.
 */

export const requestOtpSchema = z.object({
  /** Any format libphonenumber-js can parse against the ZW default region. */
  phone: z.string().min(6).max(20),
  /** WhatsApp is the default; the OTP screen can explicitly retry over SMS. */
  channel: z.enum(['whatsapp', 'sms']).optional(),
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
  avatarImageUrl: imageUrlSchema.nullable(),
  activeRole: activeRoleSchema,
  hasProviderProfile: z.boolean(),
  verificationStatus: z.enum(['unverified', 'pending', 'verified']),
  /** False until `displayName` has been changed away from its sign-up placeholder (the phone number itself). */
  profileComplete: z.boolean(),
});
export type Me = z.infer<typeof meSchema>;

export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(2).max(60),
  avatarImageUrl: imageUrlSchema.nullable().optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/** Expo push token captured from a physical iOS/Android device. */
export const registerPushTokenSchema = z.object({
  expoPushToken: z.string().trim().min(20).max(255),
  platform: z.enum(['android', 'ios']),
});
export type RegisterPushTokenInput = z.infer<typeof registerPushTokenSchema>;

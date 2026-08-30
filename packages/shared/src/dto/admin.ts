import { z } from 'zod';
import { activeRoleSchema } from './auth.js';
import { imageUrlSchema } from './uploads.js';
import { verificationStatusSchema } from './verification.js';

/**
 * Admin console DTOs (apps/admin). Deliberately separate from the client/
 * provider DTOs in auth.ts — an admin session is a different identity with
 * a different login flow (email + password, not phone + OTP), so nothing
 * here reuses `meSchema`/`authTokensSchema` even where the shape rhymes.
 */

export const adminLoginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});
export type AdminLoginInput = z.infer<typeof adminLoginSchema>;

export const adminIdentitySchema = z.object({
  id: z.uuid(),
  email: z.email(),
  displayName: z.string(),
});
export type AdminIdentity = z.infer<typeof adminIdentitySchema>;

/** The refresh token itself never appears here — it travels only as an httpOnly cookie, never in a JSON body a script could read. */
export const adminSessionSchema = z.object({
  accessToken: z.string(),
  admin: adminIdentitySchema,
});
export type AdminSession = z.infer<typeof adminSessionSchema>;

export const adminAccessTokenSchema = z.object({
  accessToken: z.string(),
});
export type AdminAccessToken = z.infer<typeof adminAccessTokenSchema>;

// --- App users / Firebase identities ---------------------------------------

export const adminFirebaseStatusSchema = z.enum([
  'active',
  'disabled',
  'missing',
  'unlinked',
  'unavailable',
]);
export type AdminFirebaseStatus = z.infer<typeof adminFirebaseStatusSchema>;

export const adminAppUserStatusSchema = z.enum(['active', 'disabled', 'deleted']);
export type AdminAppUserStatus = z.infer<typeof adminAppUserStatusSchema>;

export const adminUserRowSchema = z.object({
  id: z.uuid(),
  firebaseUid: z.string().nullable(),
  email: z.email().nullable(),
  phone: z.string().nullable(),
  displayName: z.string(),
  activeRole: activeRoleSchema,
  hasProviderProfile: z.boolean(),
  appStatus: adminAppUserStatusSchema,
  firebaseStatus: adminFirebaseStatusSchema,
  createdAt: z.iso.datetime(),
  deletedAt: z.iso.datetime().nullable(),
});
export type AdminUserRowDto = z.infer<typeof adminUserRowSchema>;

export const adminUserListSchema = z.object({
  items: z.array(adminUserRowSchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
});
export type AdminUserListDto = z.infer<typeof adminUserListSchema>;

export const createAdminUserSchema = z.object({
  email: z.email(),
  displayName: z.string().trim().min(2).max(60),
  password: z.string().min(8).max(200),
});
export type CreateAdminUserInput = z.infer<typeof createAdminUserSchema>;

export const updateAdminUserSchema = z
  .object({
    email: z.email().optional(),
    displayName: z.string().trim().min(2).max(60).optional(),
    activeRole: activeRoleSchema.optional(),
    disabled: z.boolean().optional(),
    password: z.string().min(8).max(200).optional(),
  })
  .refine(
    (input) =>
      input.email !== undefined ||
      input.displayName !== undefined ||
      input.activeRole !== undefined ||
      input.disabled !== undefined ||
      input.password !== undefined,
    { message: 'Provide at least one field to update' },
  );
export type UpdateAdminUserInput = z.infer<typeof updateAdminUserSchema>;

// --- Reports ---------------------------------------------------------------

export const reportStatusSchema = z.enum(['open', 'reviewing', 'resolved']);

/** The counterparty context a reviewer needs without a second lookup: who they are and how to reach them. */
export const adminUserSummarySchema = z.object({
  id: z.uuid(),
  displayName: z.string(),
  phone: z.string().nullable(),
});
export type AdminUserSummary = z.infer<typeof adminUserSummarySchema>;

export const adminReportRowSchema = z.object({
  id: z.uuid(),
  reporter: adminUserSummarySchema,
  reported: adminUserSummarySchema,
  bookingId: z.uuid().nullable(),
  reason: z.enum(['no_show', 'misconduct', 'safety', 'other']),
  status: reportStatusSchema,
  resolutionNote: z.string().nullable(),
  createdAt: z.iso.datetime(),
  /** Total reports ever filed against `reported`, including this one — what `requiresAdminReview()` is evaluated against. */
  reportCountAgainstReported: z.number().int(),
});
export type AdminReportRowDto = z.infer<typeof adminReportRowSchema>;

export const updateReportStatusSchema = z.object({
  status: reportStatusSchema,
  resolutionNote: z.string().trim().max(2000).optional(),
});
export type UpdateReportStatusInput = z.infer<typeof updateReportStatusSchema>;

// --- Bans --------------------------------------------------------------

export const banTriggerSchema = z.enum(['automatic', 'manual']);
export const appealStatusSchema = z.enum(['none', 'requested', 'upheld', 'overturned']);

export const adminBanRowSchema = z.object({
  id: z.uuid(),
  user: adminUserSummarySchema,
  reason: z.string(),
  trigger: banTriggerSchema,
  appealStatus: appealStatusSchema,
  appealNote: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type AdminBanRowDto = z.infer<typeof adminBanRowSchema>;

export const createManualBanSchema = z.object({
  userId: z.uuid(),
  reason: z.string().trim().min(1).max(500),
});
export type CreateManualBanInput = z.infer<typeof createManualBanSchema>;

export const resolveAppealSchema = z.object({
  appealStatus: z.enum(['requested', 'upheld', 'overturned']),
  appealNote: z.string().trim().max(2000).optional(),
});
export type ResolveAppealInput = z.infer<typeof resolveAppealSchema>;

// --- Providers (verification + subscription pricing) ------------------

export const adminProviderRowSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  displayName: z.string(),
  phone: z.string().nullable(),
  areaName: z.string(),
  categoryName: z.string(),
  verified: z.boolean(),
  verificationStatus: verificationStatusSchema,
  verificationIdDocumentUrl: imageUrlSchema.nullable(),
  verificationSelfieImageUrl: imageUrlSchema.nullable(),
  verificationNote: z.string().nullable(),
  verificationSubmittedAt: z.iso.datetime().nullable(),
  avatarImageUrl: imageUrlSchema.nullable(),
  profileImageUrl: imageUrlSchema.nullable(),
  portfolioImageUrls: z.array(imageUrlSchema).max(5),
  serviceImageUrls: z.array(imageUrlSchema).max(100),
  productImageUrls: z.array(imageUrlSchema).max(100),
  ratingAvg: z.number(),
  completedCount: z.number().int(),
  subscriptionPriceUsdCents: z.number().int(),
  subscriptionPaidUntil: z.iso.datetime().nullable(),
  subscriptionActive: z.boolean(),
  createdAt: z.iso.datetime(),
});
export type AdminProviderRowDto = z.infer<typeof adminProviderRowSchema>;

export const updateProviderAdminSchema = z
  .object({
    verified: z.boolean().optional(),
    verificationStatus: verificationStatusSchema.optional(),
    verificationNote: z.string().trim().max(2000).nullable().optional(),
    subscriptionPriceUsdCents: z.number().int().min(0).optional(),
  })
  .refine(
    (input) =>
      input.verified !== undefined ||
      input.verificationStatus !== undefined ||
      input.verificationNote !== undefined ||
      input.subscriptionPriceUsdCents !== undefined,
    {
      message: 'Provide at least one field to update',
    },
  );
export type UpdateProviderAdminInput = z.infer<typeof updateProviderAdminSchema>;

// --- Identity verification queue --------------------------------------

export const adminVerificationRowSchema = z.object({
  id: z.uuid(),
  displayName: z.string(),
  phone: z.string().nullable(),
  activeRole: activeRoleSchema,
  hasProviderProfile: z.boolean(),
  verificationStatus: verificationStatusSchema,
  idDocumentUrl: imageUrlSchema.nullable(),
  selfieImageUrl: imageUrlSchema.nullable(),
  note: z.string().nullable(),
  submittedAt: z.iso.datetime().nullable(),
});
export type AdminVerificationRowDto = z.infer<typeof adminVerificationRowSchema>;

export const reviewVerificationSchema = z.object({
  verificationStatus: verificationStatusSchema,
  verificationNote: z.string().trim().max(2000).nullable().optional(),
});
export type ReviewVerificationInput = z.infer<typeof reviewVerificationSchema>;

// --- Overview / dashboard stats -----------------------------------------

export const adminOverviewSchema = z.object({
  openReports: z.number().int(),
  reviewingReports: z.number().int(),
  activeBans: z.number().int(),
  pendingVerification: z.number().int(),
  totalProviders: z.number().int(),
});
export type AdminOverviewDto = z.infer<typeof adminOverviewSchema>;

// --- Audit log -----------------------------------------------------------

export const adminAuditActorTypeSchema = z.enum(['user', 'admin', 'system']);

export const adminAuditLogRowSchema = z.object({
  id: z.uuid(),
  actorType: adminAuditActorTypeSchema,
  actorName: z.string().nullable(),
  action: z.string(),
  targetType: z.string().nullable(),
  targetId: z.string().nullable(),
  ip: z.string().nullable(),
  at: z.iso.datetime(),
});
export type AdminAuditLogRowDto = z.infer<typeof adminAuditLogRowSchema>;

// --- Payments / payouts ---------------------------------------------------
//
// `Payment.status = 'released'` is an internal escrow-ledger state, not proof
// that a provider was actually paid — nothing in this codebase moves real
// money to a provider. These DTOs cover two distinct things: the escrow
// overview (what's held/released/refunded/failed across bookings + orders),
// and Payouts, an admin's attestation that a real-world transfer happened.

export const adminPaymentsOverviewSchema = z.object({
  /** Client money currently in escrow — booking/order payments not yet released, refunded, or failed. */
  heldUsdCents: z.number().int(),
  /** Net of platform fee, summed across every booking/order currently in the `released` state — what providers are owed in total, whether or not it's been paid out yet. */
  releasedUsdCents: z.number().int(),
  refundedUsdCents: z.number().int(),
  failedUsdCents: z.number().int(),
  /** Sum of every recorded Payout — money attested as actually sent to providers. */
  paidOutUsdCents: z.number().int(),
  /** releasedUsdCents minus paidOutUsdCents — what's outstanding right now. */
  owedUsdCents: z.number().int(),
});
export type AdminPaymentsOverviewDto = z.infer<typeof adminPaymentsOverviewSchema>;

export const adminProviderPayoutRowSchema = z.object({
  providerId: z.uuid(),
  displayName: z.string(),
  phone: z.string().nullable(),
  releasedUsdCents: z.number().int(),
  paidOutUsdCents: z.number().int(),
  owedUsdCents: z.number().int(),
  lastPayoutAt: z.iso.datetime().nullable(),
});
export type AdminProviderPayoutRowDto = z.infer<typeof adminProviderPayoutRowSchema>;

export const recordPayoutSchema = z.object({
  amountUsdCents: z.number().int().positive(),
  note: z.string().trim().max(500).optional(),
});
export type RecordPayoutInput = z.infer<typeof recordPayoutSchema>;

export const adminPayoutRowSchema = z.object({
  id: z.uuid(),
  providerId: z.uuid(),
  amountUsdCents: z.number().int(),
  note: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type AdminPayoutRowDto = z.infer<typeof adminPayoutRowSchema>;

// --- Wallet cash-outs --------------------------------------------------------
//
// A cash-out request (WalletTransaction.type = 'cash_out') already debited
// the coin ledger the moment a stylist requested it — nothing in this
// codebase moves real money to them. These DTOs cover an admin's view of
// cash-out requests and CashOutSettlement, an admin's attestation that the
// real-world transfer happened, mirroring Payout's relationship to Payment.

export const adminCashOutRowSchema = z.object({
  transactionId: z.uuid(),
  userId: z.uuid(),
  displayName: z.string(),
  phone: z.string().nullable(),
  amountUsdCents: z.number().int(),
  coins: z.number().int(),
  requestedAt: z.iso.datetime(),
  settled: z.boolean(),
  settledAt: z.iso.datetime().nullable(),
  settledNote: z.string().nullable(),
});
export type AdminCashOutRowDto = z.infer<typeof adminCashOutRowSchema>;

export const recordCashOutSettlementSchema = z.object({
  note: z.string().trim().max(500).optional(),
});
export type RecordCashOutSettlementInput = z.infer<typeof recordCashOutSettlementSchema>;

// --- Overview trends -------------------------------------------------------

export const adminOverviewTrendPointSchema = z.object({
  date: z.string(),
  bookingsCount: z.number().int(),
  releasedUsdCents: z.number().int(),
});
export type AdminOverviewTrendPointDto = z.infer<typeof adminOverviewTrendPointSchema>;

// --- Staff accounts ---------------------------------------------------------
//
// Every admin console feature so far shares one flat access level — there is
// no role model. These endpoints exist so a team can have more than the one
// bootstrap account, not to introduce permission tiers.

export const adminStaffRowSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  displayName: z.string(),
  disabled: z.boolean(),
  createdAt: z.iso.datetime(),
});
export type AdminStaffRowDto = z.infer<typeof adminStaffRowSchema>;

export const createStaffSchema = z.object({
  email: z.email(),
  displayName: z.string().trim().min(1).max(200),
  password: z.string().min(8).max(200),
});
export type CreateStaffInput = z.infer<typeof createStaffSchema>;

export const updateStaffSchema = z
  .object({
    displayName: z.string().trim().min(1).max(200).optional(),
    disabled: z.boolean().optional(),
    password: z.string().min(8).max(200).optional(),
  })
  .refine(
    (input) =>
      input.displayName !== undefined ||
      input.disabled !== undefined ||
      input.password !== undefined,
    { message: 'Provide at least one field to update' },
  );
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>;

// --- Catalog: categories + cities -------------------------------------------

export const adminCategoryRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  parentId: z.uuid().nullable(),
  parentName: z.string().nullable(),
  providerCount: z.number().int(),
});
export type AdminCategoryRowDto = z.infer<typeof adminCategoryRowSchema>;

export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(200),
  parentId: z.uuid().nullable().optional(),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = z.object({
  name: z.string().trim().min(1).max(200),
});
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export const adminCityRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  timezone: z.string(),
  centroidLat: z.number(),
  centroidLng: z.number(),
  bboxWest: z.number(),
  bboxSouth: z.number(),
  bboxEast: z.number(),
  bboxNorth: z.number(),
  userCount: z.number().int(),
  providerCount: z.number().int(),
});
export type AdminCityRowDto = z.infer<typeof adminCityRowSchema>;

export const cityInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  timezone: z.string().trim().min(1).max(100),
  centroidLat: z.number(),
  centroidLng: z.number(),
  bboxWest: z.number(),
  bboxSouth: z.number(),
  bboxEast: z.number(),
  bboxNorth: z.number(),
});
export type CityInput = z.infer<typeof cityInputSchema>;

// --- Lookup: bookings + orders ----------------------------------------------
//
// The support-facing counterpart to the raw database — find a booking/order
// by its client-facing reference (or a party's phone number) and see
// everything about it in one place, without a direct DB query.

export const adminPaymentLedgerRowSchema = z.object({
  id: z.uuid(),
  gateway: z.string(),
  status: z.string(),
  amountUsdCents: z.number().int(),
  feeUsdCents: z.number().int(),
  externalRef: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type AdminPaymentLedgerRowDto = z.infer<typeof adminPaymentLedgerRowSchema>;

export const adminBookingSummarySchema = z.object({
  id: z.uuid(),
  reference: z.string(),
  status: z.string(),
  client: adminUserSummarySchema,
  provider: adminUserSummarySchema,
  serviceName: z.string(),
  paymentMethod: z.string(),
  priceUsdCents: z.number().int(),
  startsAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
});
export type AdminBookingSummaryDto = z.infer<typeof adminBookingSummarySchema>;

export const adminOrderSummarySchema = z.object({
  id: z.uuid(),
  reference: z.string(),
  status: z.string(),
  buyer: adminUserSummarySchema,
  provider: adminUserSummarySchema,
  paymentMethod: z.string(),
  totalUsdCents: z.number().int(),
  createdAt: z.iso.datetime(),
});
export type AdminOrderSummaryDto = z.infer<typeof adminOrderSummarySchema>;

export const adminLookupResultSchema = z.object({
  bookings: z.array(adminBookingSummarySchema),
  orders: z.array(adminOrderSummarySchema),
});
export type AdminLookupResultDto = z.infer<typeof adminLookupResultSchema>;

export const adminBookingDetailSchema = adminBookingSummarySchema.extend({
  confirmedByClient: z.boolean(),
  confirmedByProvider: z.boolean(),
  payments: z.array(adminPaymentLedgerRowSchema),
  /** Up to two rows — a booking can have a client-mode and a provider-mode trip tracking the same job. */
  trips: z.array(
    z.object({
      mode: z.string(),
      arrived: z.boolean(),
      etaSharedAt: z.iso.datetime().nullable(),
      checkedInAt: z.iso.datetime().nullable(),
      startedAt: z.iso.datetime(),
    }),
  ),
  reviews: z.array(
    z.object({
      id: z.uuid(),
      rater: adminUserSummarySchema,
      rating: z.number().int(),
      text: z.string().nullable(),
      createdAt: z.iso.datetime(),
    }),
  ),
});
export type AdminBookingDetailDto = z.infer<typeof adminBookingDetailSchema>;

export const adminOrderDetailSchema = adminOrderSummarySchema.extend({
  items: z.array(
    z.object({
      nameSnapshot: z.string(),
      priceUsdCents: z.number().int(),
      quantity: z.number().int(),
    }),
  ),
  payments: z.array(adminPaymentLedgerRowSchema),
});
export type AdminOrderDetailDto = z.infer<typeof adminOrderDetailSchema>;

// --- Review moderation -------------------------------------------------------

export const adminReviewRowSchema = z.object({
  id: z.uuid(),
  bookingReference: z.string(),
  rater: adminUserSummarySchema,
  ratee: adminUserSummarySchema,
  rating: z.number().int(),
  text: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type AdminReviewRowDto = z.infer<typeof adminReviewRowSchema>;

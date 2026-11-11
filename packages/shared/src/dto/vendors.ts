import { z } from 'zod';
import { isValidMobileMoneyPhone } from '../domain/phone.js';
import { imageUrlSchema } from './uploads.js';

/**
 * Vendor verification. Only an approved vendor can list products or take
 * orders; staff review each application in the console.
 */
export const vendorStatusSchema = z.enum(['pending', 'approved', 'rejected']);
export type VendorStatus = z.infer<typeof vendorStatusSchema>;

export const VENDOR_STATUS_LABELS: Record<VendorStatus, string> = {
  pending: 'Waiting for review',
  approved: 'Approved',
  rejected: 'Not approved',
};

/** Photos of the premises are the main evidence a shop is real, so at least one is required. */
export const MIN_PREMISES_PHOTOS = 1;
export const MAX_PREMISES_PHOTOS = 6;

export const applyVendorSchema = z.object({
  businessName: z.string().trim().min(2).max(80),
  /** Only for registered businesses. */
  registrationNumber: z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  shopAddress: z.string().trim().min(5).max(200),
  /** Where the shop is on the map. Needed so buyers can see how far it is. */
  shopLat: z.number().min(-90).max(90).optional(),
  shopLng: z.number().min(-180).max(180).optional(),
  premisesPhotoUrls: z.array(imageUrlSchema).min(MIN_PREMISES_PHOTOS).max(MAX_PREMISES_PHOTOS),
  contactName: z.string().trim().min(2).max(80),
  contactPhone: z
    .string()
    .trim()
    .refine(isValidMobileMoneyPhone, { message: 'Enter a valid mobile number' }),
});
export type ApplyVendorInput = z.infer<typeof applyVendorSchema>;

/** Delivery and collection defaults. Free-text areas, as the vendor knows them. */
export const vendorFulfilmentSchema = z
  .object({
    delivers: z.boolean(),
    deliveryChargeUsdCents: z.number().int().min(0).max(100_000),
    deliveryAreas: z.array(z.string().trim().min(1).max(60)).max(30),
    collectionAddress: z.string().trim().max(200).nullable(),
    collectionHours: z.string().trim().max(120).nullable(),
  })
  .refine((v) => !v.delivers || v.deliveryAreas.length > 0, {
    path: ['deliveryAreas'],
    message: 'Add at least one area you deliver to',
  });
export type VendorFulfilmentInput = z.infer<typeof vendorFulfilmentSchema>;

export const vendorApplicationSchema = z.object({
  id: z.uuid(),
  status: vendorStatusSchema,
  businessName: z.string(),
  registrationNumber: z.string().nullable(),
  shopAddress: z.string(),
  shopLat: z.number().nullable(),
  shopLng: z.number().nullable(),
  premisesPhotoUrls: z.array(z.string()),
  contactName: z.string(),
  contactPhone: z.string(),
  /** Staff's reason, shown to the applicant when not approved. */
  reviewNote: z.string().nullable(),
  reviewedAt: z.iso.datetime().nullable(),
  submittedAt: z.iso.datetime(),
  delivers: z.boolean(),
  deliveryChargeUsdCents: z.number().int(),
  deliveryAreas: z.array(z.string()),
  collectionAddress: z.string().nullable(),
  collectionHours: z.string().nullable(),
});
export type VendorApplicationDto = z.infer<typeof vendorApplicationSchema>;

/** `GET /v1/vendors/me`: where the signed-in user stands as a vendor. */
export const vendorMeSchema = z.object({
  /** Null until they apply. */
  application: vendorApplicationSchema.nullable(),
  /** The user already has a stylist page, so applying reuses it. */
  isStylist: z.boolean(),
});
export type VendorMeDto = z.infer<typeof vendorMeSchema>;

export const adminVendorRowSchema = vendorApplicationSchema.extend({
  providerId: z.uuid(),
  userId: z.uuid(),
  /** Stylists apply from their page; other shops get a vendor-only profile. */
  isStylist: z.boolean(),
  accountName: z.string(),
  accountPhone: z.string().nullable(),
  reviewedByAdminName: z.string().nullable(),
});
export type AdminVendorRowDto = z.infer<typeof adminVendorRowSchema>;

export const reviewVendorSchema = z
  .object({
    decision: z.enum(['approved', 'rejected']),
    note: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.decision !== 'rejected' || Boolean(v.note), {
    path: ['note'],
    message: 'Tell the applicant why it was not approved',
  });
export type ReviewVendorInput = z.infer<typeof reviewVendorSchema>;

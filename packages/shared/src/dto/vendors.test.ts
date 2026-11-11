import { describe, expect, it } from 'vitest';
import { applyVendorSchema, reviewVendorSchema, vendorFulfilmentSchema } from './vendors.js';

const application = {
  businessName: 'Glow Beauty Supplies',
  shopAddress: '12 Julius Nyerere Way, Harare',
  premisesPhotoUrls: ['/uploads/0d5f1c3e-8c0a-4f6e-9a40-3b7c1d2e4f60.jpg'],
  contactName: 'Tendai Moyo',
  contactPhone: '0771234567',
};

describe('vendor application', () => {
  it('needs at least one premises photo', () => {
    expect(applyVendorSchema.safeParse(application).success).toBe(true);
    expect(applyVendorSchema.safeParse({ ...application, premisesPhotoUrls: [] }).success).toBe(
      false,
    );
  });

  it('treats an empty registration number as not registered', () => {
    const parsed = applyVendorSchema.parse({ ...application, registrationNumber: '  ' });
    expect(parsed.registrationNumber).toBeUndefined();
  });

  it('rejects a contact number that is not a mobile number', () => {
    expect(applyVendorSchema.safeParse({ ...application, contactPhone: '123' }).success).toBe(
      false,
    );
  });
});

describe('vendor delivery settings', () => {
  const base = {
    delivers: true,
    deliveryChargeUsdCents: 250,
    deliveryAreas: ['Avondale'],
    collectionAddress: null,
    collectionHours: null,
  };

  it('needs an area when the vendor delivers, and none when they do not', () => {
    expect(vendorFulfilmentSchema.safeParse(base).success).toBe(true);
    expect(vendorFulfilmentSchema.safeParse({ ...base, deliveryAreas: [] }).success).toBe(false);
    expect(
      vendorFulfilmentSchema.safeParse({ ...base, delivers: false, deliveryAreas: [] }).success,
    ).toBe(true);
  });

  it('keeps the charge a whole, non-negative number of cents', () => {
    expect(vendorFulfilmentSchema.safeParse({ ...base, deliveryChargeUsdCents: -1 }).success).toBe(
      false,
    );
    expect(vendorFulfilmentSchema.safeParse({ ...base, deliveryChargeUsdCents: 2.5 }).success).toBe(
      false,
    );
  });
});

describe('vendor review', () => {
  it('requires a reason to reject, but not to approve', () => {
    expect(reviewVendorSchema.safeParse({ decision: 'approved' }).success).toBe(true);
    expect(reviewVendorSchema.safeParse({ decision: 'rejected' }).success).toBe(false);
    expect(
      reviewVendorSchema.safeParse({ decision: 'rejected', note: 'No shop front' }).success,
    ).toBe(true);
  });
});

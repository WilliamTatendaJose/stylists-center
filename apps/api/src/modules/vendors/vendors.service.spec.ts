import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ApplyVendorInput } from '@sc/shared';
import type { Env } from '../../config/env';
import { PrismaService } from '../prisma/prisma.service';
import type { PushService } from '../notifications/push.service';
import { AdminVendorsService } from '../admin-vendors/admin-vendors.service';
import { VendorsService } from './vendors.service';

const TEST_DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://sc:sc@localhost:5433/sc_test';
const BASE_ENV = { NODE_ENV: 'test', DATABASE_URL: TEST_DATABASE_URL } as unknown as Env;

const uniquePhone = () => `+263778${String(Math.floor(Math.random() * 900000) + 100000)}`;

const application = (overrides: Partial<ApplyVendorInput> = {}): ApplyVendorInput => ({
  businessName: 'Glow Beauty Supplies',
  registrationNumber: 'REG-2024-001',
  shopAddress: '12 Julius Nyerere Way, Harare',
  shopLat: -17.83,
  shopLng: 31.05,
  premisesPhotoUrls: ['/uploads/0d5f1c3e-8c0a-4f6e-9a40-3b7c1d2e4f60.jpg'],
  contactName: 'Tendai Moyo',
  contactPhone: '0771234567',
  ...overrides,
});

describe('vendor applications', () => {
  let prisma: PrismaService;
  let vendors: VendorsService;
  let admin: AdminVendorsService;
  let push: { sendToUser: ReturnType<typeof vi.fn> };
  let cityId: string;
  let categoryId: string;
  let adminId: string;
  const userIds: string[] = [];
  const providerIds: string[] = [];

  const makeUser = async (name: string) => {
    const user = await prisma.user.create({
      data: { phone: uniquePhone(), displayName: name, cityId },
    });
    userIds.push(user.id);
    return user.id;
  };

  const makeStylist = async () => {
    const userId = await makeUser('Stylist');
    const profile = await prisma.providerProfile.create({
      data: {
        userId,
        displayName: 'Stylist',
        tint: '#111',
        initials: 'ST',
        categoryId,
        areaName: 'Avondale',
        latitude: -17.8,
        longitude: 31.03,
        cityId,
        workingHoursLabel: 'Weekdays',
      },
    });
    providerIds.push(profile.id);
    return { userId, providerId: profile.id };
  };

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService<Env, true>(BASE_ENV));
    await prisma.onModuleInit();
    push = { sendToUser: vi.fn(() => Promise.resolve()) };
    vendors = new VendorsService(prisma);
    admin = new AdminVendorsService(prisma, push as unknown as PushService);
    const stamp = String(Date.now());
    cityId = (
      await prisma.city.create({
        data: {
          name: `vendors-${stamp}`,
          timezone: 'Africa/Harare',
          centroidLat: -17.8252,
          centroidLng: 31.0335,
          bboxWest: 30.9,
          bboxSouth: -18,
          bboxEast: 31.2,
          bboxNorth: -17.6,
        },
      })
    ).id;
    categoryId = (await prisma.category.create({ data: { name: `vendors-cat-${stamp}` } })).id;
    adminId = (
      await prisma.adminUser.create({
        data: {
          email: `vendors-${stamp}@example.test`,
          passwordHash: 'x',
          displayName: 'Reviewer Rue',
          role: 'support',
        },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.vendorApplication.deleteMany({ where: { providerId: { in: providerIds } } });
    await prisma.providerProfile.deleteMany({ where: { id: { in: providerIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.adminUser.delete({ where: { id: adminId } });
    await prisma.category.delete({ where: { id: categoryId } });
    await prisma.city.delete({ where: { id: cityId } });
    await prisma.onModuleDestroy();
  });

  it('lets a stylist apply from their existing page, as pending', async () => {
    const { userId, providerId } = await makeStylist();
    const created = await vendors.apply(userId, application());
    expect(created).toMatchObject({ status: 'pending', businessName: 'Glow Beauty Supplies' });
    const me = await vendors.me(userId);
    expect(me.isStylist).toBe(true);
    expect(me.application?.id).toBe(created.id);
    // Same profile: orders and fees keep their providerId.
    expect(await prisma.providerProfile.count({ where: { userId } })).toBe(1);
    expect((await prisma.vendorApplication.findUniqueOrThrow({ where: { providerId } })).id).toBe(
      created.id,
    );
  });

  it('creates a hidden vendor-only profile for someone who is not a stylist', async () => {
    const userId = await makeUser('Shop owner');
    expect(await vendors.me(userId)).toEqual({ application: null, isStylist: false });

    const created = await vendors.apply(userId, application());
    const profile = await prisma.providerProfile.findUniqueOrThrow({ where: { userId } });
    providerIds.push(profile.id);
    expect(profile).toMatchObject({
      offersServices: false,
      displayName: 'Glow Beauty Supplies',
      latitude: -17.83,
      longitude: 31.05,
    });
    expect(created.status).toBe('pending');
    expect((await vendors.me(userId)).isStylist).toBe(false);
  });

  it('needs a map location from a shop that has no stylist page, and creates nothing without it', async () => {
    const userId = await makeUser('No pin');
    const noPin: Partial<ApplyVendorInput> = application();
    delete noPin.shopLat;
    delete noPin.shopLng;
    await expect(vendors.apply(userId, noPin as ApplyVendorInput)).rejects.toThrow('Pin your shop');
    expect(await prisma.providerProfile.count({ where: { userId } })).toBe(0);
  });

  it('refuses half a location', async () => {
    const { userId } = await makeStylist();
    const half: Partial<ApplyVendorInput> = application();
    delete half.shopLng;
    await expect(vendors.apply(userId, half as ApplyVendorInput)).rejects.toThrow('Pin the shop');
  });

  it('handles two applications at once without a duplicate or an error', async () => {
    const { userId, providerId } = await makeStylist();
    await Promise.all([vendors.apply(userId, application()), vendors.apply(userId, application())]);
    expect(await prisma.vendorApplication.count({ where: { providerId } })).toBe(1);
  });

  it('reopens a rejected application as pending and clears the old decision', async () => {
    const { userId, providerId } = await makeStylist();
    const created = await vendors.apply(userId, application());
    await admin.review(created.id, adminId, { decision: 'rejected', note: 'Photos unclear' });

    const again = await vendors.apply(userId, application({ businessName: 'Glow Supplies Ltd' }));
    expect(again).toMatchObject({
      status: 'pending',
      businessName: 'Glow Supplies Ltd',
      reviewNote: null,
      reviewedAt: null,
    });
    const row = await prisma.vendorApplication.findUniqueOrThrow({ where: { providerId } });
    expect(row.reviewedByAdminId).toBeNull();
  });

  it('does not let an approved vendor reapply', async () => {
    const { userId } = await makeStylist();
    const created = await vendors.apply(userId, application());
    await admin.review(created.id, adminId, { decision: 'approved' });
    await expect(vendors.apply(userId, application())).rejects.toThrow('already approved');
  });

  describe('delivery and collection settings', () => {
    const settings = {
      delivers: true,
      deliveryPerKmUsdCents: 60,
      deliveryAreas: ['Avondale', 'Borrowdale', 'Avondale'],
      collectionAddress: '12 Julius Nyerere Way',
      collectionHours: 'Mon-Sat 8-5',
    };

    it('are only open to an approved vendor', async () => {
      const { userId } = await makeStylist();
      await expect(vendors.updateFulfilment(userId, settings)).rejects.toThrow('not applied');
      const created = await vendors.apply(userId, application());
      await expect(vendors.updateFulfilment(userId, settings)).rejects.toThrow('once your shop');
      await admin.review(created.id, adminId, { decision: 'approved' });
      const saved = await vendors.updateFulfilment(userId, settings);
      expect(saved).toMatchObject({
        delivers: true,
        deliveryPerKmUsdCents: 60,
        // Duplicates collapse.
        deliveryAreas: ['Avondale', 'Borrowdale'],
        collectionHours: 'Mon-Sat 8-5',
      });
    });

    it('clear a collection field when it is emptied', async () => {
      const { userId } = await makeStylist();
      const created = await vendors.apply(userId, application());
      await admin.review(created.id, adminId, { decision: 'approved' });
      await vendors.updateFulfilment(userId, settings);
      const cleared = await vendors.updateFulfilment(userId, {
        ...settings,
        delivers: false,
        deliveryAreas: [],
        collectionAddress: '',
        collectionHours: null,
      });
      expect(cleared).toMatchObject({
        delivers: false,
        collectionAddress: null,
        collectionHours: null,
      });
    });
  });

  describe('staff review', () => {
    it('lists by status, oldest pending first, and finds by business name', async () => {
      const a = await makeStylist();
      const b = await makeStylist();
      const first = await vendors.apply(a.userId, application({ businessName: 'Zeta Queue One' }));
      await new Promise((resolve) => setTimeout(resolve, 5));
      const second = await vendors.apply(b.userId, application({ businessName: 'Zeta Queue Two' }));

      const pending = await admin.list({
        status: 'pending',
        q: 'Zeta Queue',
        page: { limit: 10, offset: 0 },
      });
      expect(pending.items.map((r) => r.id)).toEqual([first.id, second.id]);
      expect(pending.items[0]).toMatchObject({ isStylist: true, accountName: 'Stylist' });

      await admin.review(first.id, adminId, { decision: 'approved' });
      const approved = await admin.list({
        status: 'approved',
        q: 'Zeta Queue',
        page: { limit: 10, offset: 0 },
      });
      expect(approved.items.map((r) => r.id)).toEqual([first.id]);
      expect(approved.total).toBe(1);
    });

    it('records who decided and when, and tells the applicant', async () => {
      const { userId } = await makeStylist();
      const created = await vendors.apply(userId, application());
      push.sendToUser.mockClear();

      const reviewed = await admin.review(created.id, adminId, {
        decision: 'rejected',
        note: 'We could not see a shop front.',
      });
      expect(reviewed).toMatchObject({
        status: 'rejected',
        reviewNote: 'We could not see a shop front.',
        reviewedByAdminName: 'Reviewer Rue',
      });
      expect(reviewed.reviewedAt).not.toBeNull();
      expect(push.sendToUser).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({ data: { type: 'vendor.reviewed', status: 'rejected' } }),
      );
      expect((await vendors.me(userId)).application).toMatchObject({
        status: 'rejected',
        reviewNote: 'We could not see a shop front.',
      });
    });

    it('does not notify again for an unchanged decision, and can switch an approval off', async () => {
      const { userId, providerId } = await makeStylist();
      const created = await vendors.apply(userId, application());
      await admin.review(created.id, adminId, { decision: 'approved' });
      expect(await vendors.isApproved(providerId)).toBe(true);
      push.sendToUser.mockClear();

      await admin.review(created.id, adminId, { decision: 'approved' });
      expect(push.sendToUser).not.toHaveBeenCalled();

      await admin.review(created.id, adminId, { decision: 'rejected', note: 'Closed down' });
      expect(await vendors.isApproved(providerId)).toBe(false);
    });

    it('404s for an unknown application', async () => {
      await expect(
        admin.review('00000000-0000-4000-8000-000000000000', adminId, { decision: 'approved' }),
      ).rejects.toThrow('not found');
    });
  });
});

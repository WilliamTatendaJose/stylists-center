import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FirebaseIdentityService } from '../auth/firebase-identity.service';
import type { UserLifecycleService } from '../auth/user-lifecycle.service';
import { AdminUsersService } from '../admin-users/admin-users.service';
import { PrismaService } from '../prisma/prisma.service';
import { AdminLookupService } from './admin-lookup.service';

const TEST_DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://sc:sc@localhost:5433/sc_test';
const HOUR = 60 * 60_000;

/**
 * Staff review repeat non-payment reports, so the console shows how many
 * times a client has been reported, on the booking and on the user.
 */
describe('non-payment reports in the admin console', () => {
  let prisma: PrismaService;
  let cityId: string;
  let categoryId: string;
  let clientId: string;
  let otherClientId: string;
  let providerUserId: string;
  let providerId: string;
  let serviceId: string;
  const bookingIds: string[] = [];
  let counter = 0;

  beforeAll(async () => {
    prisma = new PrismaService(
      new ConfigService({ DATABASE_URL: TEST_DATABASE_URL, NODE_ENV: 'test' }),
    );
    await prisma.onModuleInit();
    const suffix = randomUUID().slice(0, 8);
    cityId = (
      await prisma.city.create({
        data: {
          name: `admin-np-${suffix}`,
          timezone: 'Africa/Harare',
          centroidLat: -17.8252,
          centroidLng: 31.0335,
          bboxWest: 30.9,
          bboxSouth: -18.0,
          bboxEast: 31.2,
          bboxNorth: -17.6,
        },
      })
    ).id;
    categoryId = (await prisma.category.create({ data: { name: `AdminNpCat-${suffix}` } })).id;
    const makeUser = async (name: string, prefix: string) =>
      (
        await prisma.user.create({
          data: {
            phone: `${prefix}${String(Math.floor(Math.random() * 900000) + 100000)}`,
            displayName: name,
            cityId,
          },
        })
      ).id;
    clientId = await makeUser('Repeat Client', '+263771');
    otherClientId = await makeUser('Other Client', '+263772');
    providerUserId = await makeUser('Stylist', '+263773');
    const profile = await prisma.providerProfile.create({
      data: {
        userId: providerUserId,
        displayName: 'Stylist',
        tint: '#000000',
        initials: 'ST',
        categoryId,
        areaName: 'Test area',
        latitude: -17.793,
        longitude: 31.0345,
        cityId,
        workingHoursLabel: 'Always',
        services: { create: [{ name: 'Cut', durationMinutes: 60, priceUsdCents: 2000 }] },
      },
      include: { services: true },
    });
    providerId = profile.id;
    serviceId = profile.services[0]?.id ?? '';
  });

  afterAll(async () => {
    await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } });
    await prisma.service.deleteMany({ where: { providerId } });
    await prisma.providerProfile.delete({ where: { id: providerId } });
    await prisma.user.deleteMany({
      where: { id: { in: [clientId, otherClientId, providerUserId] } },
    });
    await prisma.category.delete({ where: { id: categoryId } });
    await prisma.city.delete({ where: { id: cityId } });
    await prisma.onModuleDestroy();
  });

  async function booking(forClientId: string, reportedNote: string | null | undefined) {
    counter += 1;
    const startsAt = new Date(Date.now() - 30 * HOUR - counter * 5 * 60_000);
    const created = await prisma.booking.create({
      data: {
        reference: `SC-A${randomUUID().slice(0, 8)}`,
        clientId: forClientId,
        providerId,
        serviceId,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 60_000),
        paymentMethod: 'cash',
        status: 'completed',
        priceUsdCents: 2000,
        ...(reportedNote !== undefined
          ? { nonPaymentReportedAt: new Date(), nonPaymentNote: reportedNote }
          : {}),
      },
    });
    bookingIds.push(created.id);
    return created;
  }

  it('shows the report and how many times this client has been reported, on the booking', async () => {
    const reported = await booking(clientId, 'Left without paying');
    await booking(clientId, null);
    await booking(clientId, undefined);
    await booking(otherClientId, 'Someone else');

    const detail = await new AdminLookupService(prisma).getBooking(reported.id);
    expect(detail).toMatchObject({
      nonPaymentNote: 'Left without paying',
      clientNonPaymentReports: 2,
      serviceFeeUsdCents: 0,
      coinsUsed: 0,
    });
    expect(detail.nonPaymentReportedAt).not.toBeNull();
  });

  it('shows the count on the user, and zero for a user never reported', async () => {
    const firebase = {} as unknown as FirebaseIdentityService;
    const users = new AdminUsersService(prisma, firebase, {} as unknown as UserLifecycleService);
    expect((await users.get(clientId)).nonPaymentReports).toBe(2);
    expect((await users.get(otherClientId)).nonPaymentReports).toBe(1);
    expect((await users.get(providerUserId)).nonPaymentReports).toBe(0);

    const list = await users.list({ limit: 50, offset: 0, includeDeleted: false, query: 'Repeat' });
    expect(list.items.find((u) => u.id === clientId)?.nonPaymentReports).toBe(2);
  });
});

import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { FeeLedgerService } from './fee-ledger.service';

const TEST_DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://sc:sc@localhost:5433/sc_test';

describe('FeeLedgerService', () => {
  let prisma: PrismaService;
  let fees: FeeLedgerService;
  let cityId: string;
  let categoryId: string;
  let userId: string;
  let providerId: string;

  beforeAll(async () => {
    prisma = new PrismaService(
      new ConfigService({ DATABASE_URL: TEST_DATABASE_URL, NODE_ENV: 'test' }),
    );
    await prisma.onModuleInit();
    // 3% bookings, 5% marketplace, set the way production can: env variables.
    fees = new FeeLedgerService(
      prisma,
      new SettingsService(undefined, { SERVICE_FEE_BPS: '300', MARKETPLACE_FEE_BPS: '500' }),
    );
    const suffix = randomUUID().slice(0, 8);
    cityId = (
      await prisma.city.create({
        data: {
          name: `fees-test-${suffix}`,
          timezone: 'Africa/Harare',
          centroidLat: -17.8252,
          centroidLng: 31.0335,
          bboxWest: 30.9,
          bboxSouth: -17.95,
          bboxEast: 31.2,
          bboxNorth: -17.7,
        },
      })
    ).id;
    categoryId = (await prisma.category.create({ data: { name: `FeesCat-${suffix}` } })).id;
    userId = (
      await prisma.user.create({
        data: {
          phone: `+263771${String(Math.floor(Math.random() * 900000) + 100000)}`,
          displayName: 'Fee Payer',
          activeRole: 'provider',
          cityId,
        },
      })
    ).id;
    providerId = (
      await prisma.providerProfile.create({
        data: {
          userId,
          displayName: 'Fee Payer',
          tint: '#111111',
          initials: 'FP',
          categoryId,
          areaName: 'Avondale',
          latitude: -17.8,
          longitude: 31.03,
          cityId,
          workingHoursLabel: 'Weekdays',
        },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.feeLedgerEntry.deleteMany({ where: { providerId } });
    await prisma.providerProfile.delete({ where: { id: providerId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.category.delete({ where: { id: categoryId } });
    await prisma.city.delete({ where: { id: cityId } });
    await prisma.onModuleDestroy();
  });

  it('charges a booking once, even when called twice in the same transaction', async () => {
    const bookingId = randomUUID();
    const results = await prisma.$transaction(async (tx) => {
      const first = await fees.chargeBooking(tx, { providerId, bookingId, priceUsdCents: 2000 });
      const again = await fees.chargeBooking(tx, { providerId, bookingId, priceUsdCents: 2000 });
      // The repeat must not have aborted the transaction: this query still works.
      const rows = await tx.feeLedgerEntry.count({ where: { bookingId } });
      return { first, again, rows };
    });
    expect(results).toEqual({ first: 60, again: null, rows: 1 });
    const row = await prisma.feeLedgerEntry.findFirstOrThrow({ where: { bookingId } });
    expect(row).toMatchObject({ kind: 'booking_fee', baseUsdCents: 2000, rateBps: 300 });
  });

  it('charges marketplace commission at its own rate, and a waiver reverses it once', async () => {
    const orderId = randomUUID();
    expect(
      await fees.chargeOrder(prisma, { providerId, orderId, productTotalUsdCents: 4000 }),
    ).toBe(200);
    expect(await fees.waive(prisma, { orderId }, 'Cancelled after collection')).toBe(200);
    expect(await fees.waive(prisma, { orderId }, 'Again')).toBe(0);
    const net = await prisma.feeLedgerEntry.aggregate({
      where: { orderId },
      _sum: { amountUsdCents: true },
    });
    expect(net._sum.amountUsdCents).toBe(0);
  });

  it('waiving something never charged does nothing', async () => {
    expect(await fees.waive(prisma, { bookingId: randomUUID() }, 'Nothing here')).toBe(0);
  });

  it('balance is charges less waivers and payments', async () => {
    const before = await fees.balance(providerId);
    await fees.chargeBooking(prisma, { providerId, bookingId: randomUUID(), priceUsdCents: 10000 });
    await fees.recordPayment(prisma, { providerId, amountUsdCents: 100, note: 'Paid at office' });
    expect(await fees.balance(providerId)).toBe(before + 300 - 100);
    const entries = await fees.entries(providerId);
    expect(entries.at(-1)).toMatchObject({ kind: 'payment', amountUsdCents: -100 });
  });
});

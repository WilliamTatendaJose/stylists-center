import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Booking, Prisma } from '../../generated/prisma';
import { FeeLedgerService } from '../fees/fee-ledger.service';
import { FeeStandingService } from '../fees/fee-standing.service';
import { PushService } from '../notifications/push.service';
import { PrismaService } from '../prisma/prisma.service';
import { SocketEmitterService } from '../realtime/socket-emitter.service';
import { RewardsHooksService } from '../rewards/rewards-hooks.service';
import { SettingsService } from '../settings/settings.service';
import { BookingLifecycleService } from './booking-lifecycle.service';

const TEST_DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://sc:sc@localhost:5433/sc_test';
const HOUR = 60 * 60_000;

/** Records what completing a booking tells the rewards programme. */
class FakeRewards extends RewardsHooksService {
  completed: { bookingId: string; clientId: string; amountPaidUsdCents: number }[] = [];
  override onBookingCompleted(
    _tx: Prisma.TransactionClient,
    input: { bookingId: string; clientId: string; amountPaidUsdCents: number },
  ): Promise<void> {
    this.completed.push(input);
    return Promise.resolve();
  }
}

/**
 * Completion, automatic completion and non-payment reports, against real
 * Postgres. Bookings are inserted directly (in the past where the rule needs
 * it) because the create path rightly refuses past appointments.
 */
describe('BookingLifecycleService', () => {
  let prisma: PrismaService;
  let lifecycle: BookingLifecycleService;
  let fees: FeeLedgerService;
  let rewards: FakeRewards;
  let cityId: string;
  let categoryId: string;
  let clientId: string;
  let providerUserId: string;
  let providerId: string;
  let otherProviderUserId: string;
  let otherProviderId: string;
  let serviceId: string;
  let counter = 0;
  const bookingIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService(
      new ConfigService({ DATABASE_URL: TEST_DATABASE_URL, NODE_ENV: 'test' }),
    );
    await prisma.onModuleInit();
    const suffix = randomUUID().slice(0, 8);
    cityId = (
      await prisma.city.create({
        data: {
          name: `lifecycle-${suffix}`,
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
    categoryId = (await prisma.category.create({ data: { name: `LifecycleCat-${suffix}` } })).id;
    clientId = (
      await prisma.user.create({
        data: {
          phone: `+263771${String(Math.floor(Math.random() * 900000) + 100000)}`,
          displayName: 'Lifecycle Client',
          cityId,
        },
      })
    ).id;
    const makeProvider = async (name: string, phonePrefix: string) => {
      const user = await prisma.user.create({
        data: {
          phone: `${phonePrefix}${String(Math.floor(Math.random() * 900000) + 100000)}`,
          displayName: name,
          cityId,
        },
      });
      const profile = await prisma.providerProfile.create({
        data: {
          userId: user.id,
          displayName: name,
          tint: '#000000',
          initials: 'LP',
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
      return { user, profile };
    };
    const first = await makeProvider('Lifecycle Stylist', '+263772');
    providerUserId = first.user.id;
    providerId = first.profile.id;
    serviceId = first.profile.services[0]?.id ?? '';
    const second = await makeProvider('Other Stylist', '+263773');
    otherProviderUserId = second.user.id;
    otherProviderId = second.profile.id;
  });

  afterAll(async () => {
    await prisma.feeLedgerEntry.deleteMany({ where: { providerId: { in: [providerId] } } });
    await prisma.payment.deleteMany({ where: { bookingId: { in: bookingIds } } });
    await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } });
    await prisma.service.deleteMany({
      where: { providerId: { in: [providerId, otherProviderId] } },
    });
    await prisma.providerProfile.deleteMany({
      where: { id: { in: [providerId, otherProviderId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [clientId, providerUserId, otherProviderUserId] } },
    });
    await prisma.category.delete({ where: { id: categoryId } });
    await prisma.city.delete({ where: { id: cityId } });
    await prisma.onModuleDestroy();
  });

  beforeEach(() => {
    const settings = new SettingsService(undefined, {});
    rewards = new FakeRewards();
    fees = new FeeLedgerService(prisma, settings);
    lifecycle = new BookingLifecycleService(
      prisma,
      fees,
      rewards,
      new FeeStandingService(),
      new SocketEmitterService(),
      new PushService(prisma, new ConfigService({ NODE_ENV: 'test' })),
      settings,
    );
  });

  /** A confirmed $20 booking (fee $0.60) that started `startedHoursAgo` ago and lasted an hour. */
  async function confirmedBooking(
    startedHoursAgo: number,
    extra: Partial<Prisma.BookingUncheckedCreateInput> = {},
  ): Promise<Booking> {
    counter += 1;
    // Distinct, non-overlapping slots (a stylist cannot hold two at once), a
    // minute long and two minutes apart so `startedHoursAgo` stays accurate.
    const startsAt = new Date(Date.now() - startedHoursAgo * HOUR - counter * 2 * 60_000);
    const booking = await prisma.booking.create({
      data: {
        reference: `SC-T${randomUUID().slice(0, 8)}`,
        clientId,
        providerId,
        serviceId,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 60_000),
        paymentMethod: 'cash',
        status: 'confirmed',
        priceUsdCents: 2000,
        serviceFeeUsdCents: 60,
        serviceFeeBps: 300,
        ...extra,
      },
    });
    bookingIds.push(booking.id);
    return booking;
  }

  const feeEntries = (bookingId: string) =>
    prisma.feeLedgerEntry.findMany({ where: { bookingId }, orderBy: { createdAt: 'asc' } });

  describe('completion', () => {
    it('charges the fee on the stylist price and tells rewards what the client paid in cash', async () => {
      const booking = await confirmedBooking(2, { coinsUsed: 5, coinsUsdCents: 50 });
      await lifecycle.confirm(booking.id, 'client');
      expect(rewards.completed).toHaveLength(0); // one side only: nothing owed yet
      expect(await feeEntries(booking.id)).toHaveLength(0);

      const done = await lifecycle.confirm(booking.id, 'provider');
      expect(done).toMatchObject({ status: 'completed', autoCompleted: false });
      expect(done.completedAt).not.toBeNull();

      const entries = await feeEntries(booking.id);
      expect(entries).toHaveLength(1);
      // 3% of the $20 price, not of the $20.60 the client was shown.
      expect(entries[0]).toMatchObject({
        kind: 'booking_fee',
        amountUsdCents: 60,
        baseUsdCents: 2000,
        providerId,
      });
      // $20.60 total less $0.50 of coins.
      expect(rewards.completed).toEqual([
        { bookingId: booking.id, clientId, amountPaidUsdCents: 2010 },
      ]);
    });

    it('records each side confirmation time', async () => {
      const booking = await confirmedBooking(2);
      const afterClient = await lifecycle.confirm(booking.id, 'client');
      expect(afterClient.confirmedByClientAt).not.toBeNull();
      expect(afterClient.confirmedByProviderAt).toBeNull();
    });

    it('charges and rewards once when both sides confirm at the same moment', async () => {
      const booking = await confirmedBooking(2);
      await Promise.all([
        lifecycle.confirm(booking.id, 'client'),
        lifecycle.confirm(booking.id, 'provider'),
        lifecycle.confirm(booking.id, 'client'),
        lifecycle.confirm(booking.id, 'provider'),
      ]);
      expect(await feeEntries(booking.id)).toHaveLength(1);
      expect(rewards.completed).toHaveLength(1);
      const profile = await prisma.providerProfile.findUniqueOrThrow({ where: { id: providerId } });
      expect(profile.completedCount).toBeGreaterThanOrEqual(1);
      const after = await lifecycle.confirm(booking.id, 'provider');
      expect(after.status).toBe('completed');
      expect(await feeEntries(booking.id)).toHaveLength(1);
    });

    it('charges nothing on a booking that is cancelled or declined', async () => {
      const cancelled = await confirmedBooking(2, { status: 'cancelled' });
      await expect(lifecycle.confirm(cancelled.id, 'provider')).rejects.toThrow(
        'Cannot confirm completion',
      );
      expect(await feeEntries(cancelled.id)).toHaveLength(0);
      expect(rewards.completed).toHaveLength(0);
    });
  });

  describe('automatic completion', () => {
    it('completes a booking only the client confirmed once the window has passed', async () => {
      const booking = await confirmedBooking(100, {
        confirmedByClient: true,
        confirmedByClientAt: new Date(Date.now() - 49 * HOUR),
      });
      expect(await lifecycle.autoCompleteDue()).toBeGreaterThanOrEqual(1);

      const done = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(done).toMatchObject({ status: 'completed', autoCompleted: true });
      expect(await feeEntries(booking.id)).toHaveLength(1);
      expect(rewards.completed.map((c) => c.bookingId)).toContain(booking.id);
    });

    it('completes a booking only the stylist confirmed', async () => {
      const booking = await confirmedBooking(100, {
        confirmedByProvider: true,
        confirmedByProviderAt: new Date(Date.now() - 49 * HOUR),
      });
      await lifecycle.autoCompleteDue();
      expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe(
        'completed',
      );
      expect(await feeEntries(booking.id)).toHaveLength(1);
    });

    it('waits for the full window after the confirmation', async () => {
      const booking = await confirmedBooking(100, {
        confirmedByClient: true,
        confirmedByClientAt: new Date(Date.now() - 47 * HOUR),
      });
      await lifecycle.autoCompleteDue();
      expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe(
        'confirmed',
      );
      // The same booking is due once the clock reaches the window.
      await lifecycle.autoCompleteDue(new Date(Date.now() + 2 * HOUR));
      expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe(
        'completed',
      );
    });

    it('does not complete a job whose appointment has not happened yet', async () => {
      // Confirmed ahead of time, appointment still 3 days away.
      counter += 1;
      const startsAt = new Date(Date.now() + 3 * 24 * HOUR + counter * 2 * 60_000);
      const booking = await prisma.booking.create({
        data: {
          reference: `SC-T${randomUUID().slice(0, 8)}`,
          clientId,
          providerId,
          serviceId,
          startsAt,
          endsAt: new Date(startsAt.getTime() + HOUR),
          paymentMethod: 'cash',
          status: 'confirmed',
          priceUsdCents: 2000,
          confirmedByProvider: true,
          confirmedByProviderAt: new Date(Date.now() - 72 * HOUR),
        },
      });
      bookingIds.push(booking.id);
      await lifecycle.autoCompleteDue();
      expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe(
        'confirmed',
      );
    });

    it('is safe to run twice, and from two places at once', async () => {
      const booking = await confirmedBooking(100, {
        confirmedByClient: true,
        confirmedByClientAt: new Date(Date.now() - 60 * HOUR),
      });
      await Promise.all([lifecycle.autoCompleteDue(), lifecycle.autoCompleteDue()]);
      await lifecycle.autoCompleteDue();
      expect(await feeEntries(booking.id)).toHaveLength(1);
      expect(rewards.completed.filter((c) => c.bookingId === booking.id)).toHaveLength(1);
    });

    it('leaves a booking neither side confirmed, and one the stylist reported as unpaid', async () => {
      const neither = await confirmedBooking(100);
      const reported = await confirmedBooking(100, {
        confirmedByClient: true,
        confirmedByClientAt: new Date(Date.now() - 60 * HOUR),
        nonPaymentReportedAt: new Date(),
      });
      await lifecycle.autoCompleteDue();
      for (const { id } of [neither, reported]) {
        expect((await prisma.booking.findUniqueOrThrow({ where: { id } })).status).toBe(
          'confirmed',
        );
      }
    });
  });

  describe('non-payment reports', () => {
    it('completes a not-yet-charged booking with no fee and no coins earned, and never charges it later', async () => {
      const booking = await confirmedBooking(2, {
        confirmedByClient: true,
        confirmedByClientAt: new Date(),
      });
      const reported = await lifecycle.reportNonPayment(
        booking.id,
        providerId,
        '  Left without paying ',
      );
      expect(reported).toMatchObject({
        status: 'completed',
        nonPaymentNote: 'Left without paying',
      });
      expect(reported.nonPaymentReportedAt).not.toBeNull();
      expect(await feeEntries(booking.id)).toHaveLength(0);
      expect(rewards.completed.map((c) => c.bookingId)).not.toContain(booking.id);

      // Neither confirmation path nor the sweep can charge it afterwards.
      await lifecycle.confirm(booking.id, 'provider');
      await lifecycle.autoCompleteDue(new Date(Date.now() + 100 * HOUR));
      expect(await feeEntries(booking.id)).toHaveLength(0);
    });

    it('waives a fee that was already charged', async () => {
      const booking = await confirmedBooking(2);
      await lifecycle.confirm(booking.id, 'client');
      await lifecycle.confirm(booking.id, 'provider');
      const before = await fees.balance(providerId);

      await lifecycle.reportNonPayment(booking.id, providerId);
      const entries = await feeEntries(booking.id);
      expect(entries.map((e) => [e.kind, e.amountUsdCents])).toEqual([
        ['booking_fee', 60],
        ['waiver', -60],
      ]);
      expect(await fees.balance(providerId)).toBe(before - 60);
    });

    it('is a retry, not a second report, when sent twice', async () => {
      const booking = await confirmedBooking(2);
      await lifecycle.confirm(booking.id, 'client');
      await lifecycle.confirm(booking.id, 'provider');
      await Promise.all([
        lifecycle.reportNonPayment(booking.id, providerId),
        lifecycle.reportNonPayment(booking.id, providerId),
      ]);
      await lifecycle.reportNonPayment(booking.id, providerId);
      expect(await feeEntries(booking.id)).toHaveLength(2); // charge + one waiver
    });

    it('is allowed up to 48 hours after the start and not after', async () => {
      const inside = await confirmedBooking(47);
      await expect(lifecycle.reportNonPayment(inside.id, providerId)).resolves.toBeDefined();

      const late = await confirmedBooking(49);
      await expect(lifecycle.reportNonPayment(late.id, providerId)).rejects.toThrow(
        '48 hours for reporting non-payment have passed',
      );
      expect(
        (await prisma.booking.findUniqueOrThrow({ where: { id: late.id } })).nonPaymentReportedAt,
      ).toBeNull();
    });

    it('is not allowed before the appointment starts', async () => {
      const future = await confirmedBooking(-5);
      await expect(lifecycle.reportNonPayment(future.id, providerId)).rejects.toThrow(
        'once the appointment has started',
      );
    });

    it('cannot be made for another stylist’s booking, or one that was never confirmed', async () => {
      const booking = await confirmedBooking(2);
      await expect(lifecycle.reportNonPayment(booking.id, otherProviderId)).rejects.toThrow();
      const awaiting = await confirmedBooking(2, { status: 'awaiting_provider' });
      await expect(lifecycle.reportNonPayment(awaiting.id, providerId)).rejects.toThrow(
        'cannot be reported',
      );
      const cancelled = await confirmedBooking(2, { status: 'cancelled' });
      await expect(lifecycle.reportNonPayment(cancelled.id, providerId)).rejects.toThrow(
        'cannot be reported',
      );
    });
  });
});

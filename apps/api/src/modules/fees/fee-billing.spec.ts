import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../config/env';
import { GeoRepository } from '../geo/geo.repository';
import { ProvidersService } from '../providers/providers.service';
import { PaymentsService } from '../payments/payments.service';
import { PaymentStatusService } from '../payments/payment-status.service';
import type { PaymentGatewayPort, PaymentPollStatus } from '../payments/payment-gateway.port';
import { PrismaService } from '../prisma/prisma.service';
import type { PushService } from '../notifications/push.service';
import { SettingsService } from '../settings/settings.service';
import { AdminFeesService } from './admin-fees.service';
import { FeeLedgerService } from './fee-ledger.service';
import { FeeReminderService } from './fee-reminder.service';
import { FEES_UNPAID_MESSAGE, FeeStandingService } from './fee-standing.service';
import { FeeStatementService } from './fee-statement.service';
import { FeesService } from './fees.service';

const TEST_DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://sc:sc@localhost:5433/sc_test';
const ENV = { NODE_ENV: 'test', DATABASE_URL: TEST_DATABASE_URL, PAYMENT_PROVIDER: 'paynow' };

/** Midday UTC is 14:00 in Harare: the same calendar day in both. */
const at = (iso: string) => new Date(`${iso}T12:00:00Z`);

describe('fee billing', () => {
  let prisma: PrismaService;
  let ledger: FeeLedgerService;
  let statements: FeeStatementService;
  let standing: FeeStandingService;
  let cityId: string;
  let categoryId: string;
  const userIds: string[] = [];
  const providerIds: string[] = [];
  const pushed: { userId: string; title: string; body: string }[] = [];
  let reminders: FeeReminderService;
  const settings = new SettingsService(undefined, {});

  async function makeProvider(label: string): Promise<{ id: string; userId: string }> {
    const user = await prisma.user.create({
      data: {
        phone: `+263772${String(Math.floor(Math.random() * 900000) + 100000)}`,
        displayName: label,
        activeRole: 'provider',
        cityId,
      },
    });
    userIds.push(user.id);
    const provider = await prisma.providerProfile.create({
      data: {
        userId: user.id,
        displayName: label,
        tint: '#111111',
        initials: 'FB',
        categoryId,
        areaName: 'Avondale',
        latitude: -17.8,
        longitude: 31.03,
        cityId,
        workingHoursLabel: 'Weekdays',
      },
    });
    providerIds.push(provider.id);
    return { id: provider.id, userId: user.id };
  }

  /** A ledger row dated in the past, the way a month of real activity looks. */
  function entry(
    providerId: string,
    kind: 'booking_fee' | 'order_fee' | 'payment' | 'adjustment' | 'waiver',
    amountUsdCents: number,
    when: string,
  ) {
    return prisma.feeLedgerEntry.create({
      data: {
        providerId,
        kind,
        amountUsdCents,
        createdAt: at(when),
        ...(kind === 'booking_fee' || kind === 'waiver' ? { bookingId: randomUUID() } : {}),
        ...(kind === 'order_fee' ? { orderId: randomUUID() } : {}),
      },
    });
  }

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService(ENV));
    await prisma.onModuleInit();
    ledger = new FeeLedgerService(prisma, settings);
    statements = new FeeStatementService(prisma, settings);
    standing = new FeeStandingService(prisma, settings);
    const push = {
      sendToUser: vi.fn((userId: string, message: { title: string; body: string }) => {
        pushed.push({ userId, ...message });
        return Promise.resolve();
      }),
    } as unknown as PushService;
    reminders = new FeeReminderService(prisma, standing, push, settings);

    const suffix = randomUUID().slice(0, 8);
    cityId = (
      await prisma.city.create({
        data: {
          name: `fee-billing-${suffix}`,
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
    categoryId = (await prisma.category.create({ data: { name: `FeeBilling-${suffix}` } })).id;
  });

  afterAll(async () => {
    await prisma.feeReminder.deleteMany({
      where: { statement: { providerId: { in: providerIds } } },
    });
    await prisma.feeStatement.deleteMany({ where: { providerId: { in: providerIds } } });
    await prisma.payment.deleteMany({ where: { feeProviderId: { in: providerIds } } });
    await prisma.feeLedgerEntry.deleteMany({ where: { providerId: { in: providerIds } } });
    await prisma.auditLog.deleteMany({ where: { targetId: { in: providerIds } } });
    await prisma.providerProfile.deleteMany({ where: { id: { in: providerIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.category.delete({ where: { id: categoryId } });
    await prisma.city.delete({ where: { id: cityId } });
    await prisma.onModuleDestroy();
  });

  describe('monthly statements', () => {
    it('summarises each finished month, carries the balance, and is due on the 5th of the next month', async () => {
      const { id } = await makeProvider('Statements');
      await entry(id, 'booking_fee', 60, '2026-09-10');
      await entry(id, 'order_fee', 100, '2026-09-20');
      await entry(id, 'payment', -50, '2026-10-03');
      await entry(id, 'adjustment', 20, '2026-10-15');
      // The current month has no statement yet.
      await entry(id, 'booking_fee', 30, '2026-11-02');

      await statements.generateMissing(at('2026-11-10'));

      const list = await prisma.feeStatement.findMany({
        where: { providerId: id },
        orderBy: { month: 'asc' },
      });
      expect(list.map((s) => s.month)).toEqual(['2026-09', '2026-10']);
      expect(list[0]).toMatchObject({
        openingUsdCents: 0,
        bookingFeesUsdCents: 60,
        orderFeesUsdCents: 100,
        waiversUsdCents: 0,
        paymentsUsdCents: 0,
        adjustmentsUsdCents: 0,
        closingUsdCents: 160,
      });
      expect(list[0]?.dueAt.toISOString()).toBe('2026-10-04T22:00:00.000Z'); // 5 Oct, Harare
      expect(list[1]).toMatchObject({
        openingUsdCents: 160,
        paymentsUsdCents: 50,
        adjustmentsUsdCents: 20,
        closingUsdCents: 130,
      });
      expect(list[1]?.dueAt.toISOString()).toBe('2026-11-04T22:00:00.000Z');
    });

    it('catches up missed months, and a month with no activity gets no statement', async () => {
      const { id } = await makeProvider('Catch up');
      await entry(id, 'booking_fee', 90, '2026-06-12');
      await entry(id, 'booking_fee', 30, '2026-08-12');
      await statements.generateMissing(at('2026-11-10'));
      const months = (await prisma.feeStatement.findMany({ where: { providerId: id } }))
        .map((s) => s.month)
        .sort();
      expect(months).toEqual(['2026-06', '2026-08']);
    });

    it('is idempotent, race-safe, and never shifts when settings or the ledger change later', async () => {
      const { id } = await makeProvider('Idempotent');
      await entry(id, 'booking_fee', 60, '2026-09-10');

      await Promise.all([
        statements.generateMissing(at('2026-11-10')),
        statements.generateMissing(at('2026-11-10')),
      ]);
      expect(await prisma.feeStatement.count({ where: { providerId: id } })).toBe(1);
      const before = await prisma.feeStatement.findFirstOrThrow({ where: { providerId: id } });

      // A different due day and a late correction to that month do not rewrite it.
      const laterSettings = new SettingsService(undefined, { BILLING_DUE_DAY: '20' });
      await new FeeStatementService(prisma, laterSettings).generateMissing(at('2026-12-10'));
      await entry(id, 'booking_fee', 999, '2026-09-25');
      await statements.generateMissing(at('2026-12-10'));

      const after = await prisma.feeStatement.findMany({ where: { providerId: id } });
      expect(after).toEqual([before]);
    });

    it('uses the Harare calendar for month boundaries', async () => {
      const { id } = await makeProvider('Boundary');
      // 23:30 UTC on 30 Sep is 01:30 on 1 Oct in Harare: an October fee.
      await prisma.feeLedgerEntry.create({
        data: {
          providerId: id,
          kind: 'booking_fee',
          amountUsdCents: 40,
          bookingId: randomUUID(),
          createdAt: new Date('2026-09-30T23:30:00Z'),
        },
      });
      await statements.generateMissing(at('2026-11-10'));
      const row = await prisma.feeStatement.findFirstOrThrow({ where: { providerId: id } });
      expect(row.month).toBe('2026-10');
    });
  });

  describe('standing and restriction', () => {
    it('restricts only once a statement is unpaid 30 days after its due date', async () => {
      const { id } = await makeProvider('Restricted');
      await entry(id, 'booking_fee', 200, '2026-09-10');
      await statements.generateMissing(at('2026-11-10')); // Sep statement, due 5 Oct

      // Before it is due: owes, but is not overdue.
      let result = (await standing.standing([id], at('2026-10-01'))).get(id);
      expect(result).toBeUndefined();
      // Overdue by 15 days: overdue, not restricted.
      result = (await standing.standing([id], at('2026-10-20'))).get(id);
      expect(result).toEqual({ overdueUsdCents: 200, restricted: false });
      await expect(standing.assertCanTrade(id, at('2026-10-20'))).resolves.toBeUndefined();
      // 30 days after 5 Oct is 4 Nov (Harare midnight, 22:00 UTC the day before).
      expect((await standing.standing([id], at('2026-11-03'))).get(id)?.restricted).toBe(false);
      expect(
        (await standing.standing([id], new Date('2026-11-04T22:00:00Z'))).get(id)?.restricted,
      ).toBe(true);

      await expect(standing.assertCanTrade(id, at('2026-11-10'))).rejects.toThrow(
        FEES_UNPAID_MESSAGE,
      );
      await expect(standing.assertCanTrade(id, at('2026-11-10'))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(await standing.restrictedProviderIds(at('2026-11-10'))).toContain(id);
    });

    it('lifts the restriction only when payments since the statement cover its closing balance', async () => {
      const { id } = await makeProvider('Part payer');
      await entry(id, 'booking_fee', 200, '2026-09-10');
      await statements.generateMissing(at('2026-11-10'));
      const now = at('2026-11-10');

      await entry(id, 'payment', -100, '2026-11-06');
      expect((await standing.standing([id], now)).get(id)?.restricted).toBe(true);
      await entry(id, 'payment', -100, '2026-11-07');
      expect((await standing.standing([id], now)).get(id)).toBeUndefined();
      await expect(standing.assertCanTrade(id, now)).resolves.toBeUndefined();
      expect(await standing.restrictedProviderIds(now)).not.toContain(id);
    });

    it('does not count a payment made before the statement was issued', async () => {
      const { id } = await makeProvider('Early payer');
      await entry(id, 'booking_fee', 300, '2026-09-05');
      await entry(id, 'payment', -100, '2026-09-28'); // inside September: already in the closing balance
      await statements.generateMissing(at('2026-11-10'));
      // Closing is 200; nothing paid since, so 200 is unpaid and overdue.
      expect((await standing.standing([id], at('2026-11-10'))).get(id)).toEqual({
        overdueUsdCents: 200,
        restricted: true,
      });
    });

    it('a negative staff adjustment counts as a payment; one that clears the balance entirely holds nobody', async () => {
      const { id } = await makeProvider('Credited');
      await entry(id, 'booking_fee', 200, '2026-09-10');
      await statements.generateMissing(at('2026-11-10'));
      await entry(id, 'adjustment', -200, '2026-11-08');
      expect((await standing.standing([id], at('2026-11-10'))).get(id)).toBeUndefined();
    });

    it('never holds a provider for more than they owe now', async () => {
      const { id } = await makeProvider('Waived');
      await entry(id, 'booking_fee', 200, '2026-09-10');
      await statements.generateMissing(at('2026-11-10'));
      // A later waiver is not a payment, but the balance it leaves is zero.
      await entry(id, 'waiver', -200, '2026-11-08');
      expect((await standing.standing([id], at('2026-11-10'))).get(id)).toBeUndefined();
    });
  });

  describe('hiding restricted providers', () => {
    it('leaves them out of search, smart match and the map, and marks their page unavailable', async () => {
      const good = await makeProvider('Visible Stylist');
      const bad = await makeProvider('Paused Stylist');
      await entry(bad.id, 'booking_fee', 200, '2026-08-10');
      await statements.generateMissing(new Date()); // Aug statement, long overdue by the real clock

      // The listing applies the real clock, so make sure the fixture is truly restricted.
      expect(await standing.isRestricted(bad.id)).toBe(true);
      const geo = new GeoRepository(prisma, standing);
      const find = (options: { searchTerm?: string; onlyAcceptingBookings?: boolean }) =>
        geo.findProvidersWithinRadius({
          lat: -17.8,
          lng: 31.03,
          radiusKm: 5,
          categoryId,
          ...options,
        });

      for (const options of [{}, { onlyAcceptingBookings: true }, { searchTerm: 'Stylist' }]) {
        const ids = (await find(options)).map((r) => r.id);
        expect(ids).toContain(good.id);
        expect(ids).not.toContain(bad.id);
      }
      // Without the fees module wired in, nobody is hidden.
      const unfiltered = await new GeoRepository(prisma).findProvidersWithinRadius({
        lat: -17.8,
        lng: 31.03,
        radiusKm: 5,
        categoryId,
      });
      expect(unfiltered.map((r) => r.id)).toContain(bad.id);

      const providers = new ProvidersService(prisma, geo, standing);
      expect((await providers.getById(bad.id, -17.8, 31.03)).unavailable).toBe(true);
      expect((await providers.getById(good.id, -17.8, 31.03)).unavailable).toBeUndefined();
    });
  });

  describe('reminders', () => {
    it('sends each reminder once while a balance is unpaid, and stops once it is paid', async () => {
      const { id, userId } = await makeProvider('Reminded');
      await entry(id, 'booking_fee', 130, '2026-10-10');
      await statements.generateMissing(at('2026-11-01')); // Oct statement, due 5 Nov
      const mine = () => pushed.filter((p) => p.userId === userId);

      await reminders.sendDue(at('2026-11-01')); // 4 days out: too early
      expect(mine()).toHaveLength(0);

      await reminders.sendDue(at('2026-11-02')); // 3 days before
      expect(mine()).toHaveLength(1);
      expect(mine()[0]?.body).toContain('$1.30');
      expect(mine()[0]?.body).toContain('5 Nov');
      await reminders.sendDue(at('2026-11-02')); // same run again
      await reminders.sendDue(at('2026-11-03')); // still inside the window
      expect(mine()).toHaveLength(1);

      await reminders.sendDue(at('2026-11-05')); // due date
      expect(mine()).toHaveLength(2);
      await reminders.sendDue(at('2026-11-06'));
      expect(mine()).toHaveLength(2);

      await reminders.sendDue(at('2026-11-12')); // 7 days after
      expect(mine()).toHaveLength(3);
      expect(mine()[2]?.title).toBe('Fees overdue');
      await reminders.sendDue(at('2026-11-13'));
      await reminders.sendDue(at('2026-11-12'));
      expect(mine()).toHaveLength(3);

      const kinds = await prisma.feeReminder.findMany({
        where: { statement: { providerId: id } },
        select: { kind: true },
      });
      expect(kinds.map((k) => k.kind).sort()).toEqual(['before_due', 'on_due', 'overdue']);
    });

    it('does not remind a provider who has paid', async () => {
      const { id, userId } = await makeProvider('Paid up');
      await entry(id, 'booking_fee', 130, '2026-10-10');
      await statements.generateMissing(at('2026-11-01'));
      await entry(id, 'payment', -130, '2026-11-02');
      await reminders.sendDue(at('2026-11-02'));
      await reminders.sendDue(at('2026-11-05'));
      await reminders.sendDue(at('2026-11-12'));
      expect(pushed.filter((p) => p.userId === userId)).toHaveLength(0);
    });

    it('two runs at the same moment send one reminder', async () => {
      const { id, userId } = await makeProvider('Racing');
      await entry(id, 'booking_fee', 130, '2026-10-10');
      await statements.generateMissing(at('2026-11-01'));
      await Promise.all([reminders.sendDue(at('2026-11-05')), reminders.sendDue(at('2026-11-05'))]);
      expect(pushed.filter((p) => p.userId === userId)).toHaveLength(1);
    });
  });

  describe('paying the balance', () => {
    let pollResult: PaymentPollStatus = 'pending';
    const gateway: PaymentGatewayPort = {
      createCheckout: (input) =>
        Promise.resolve({
          externalRef: `https://paynow.example/poll/${input.reference}`,
          status: 'pending',
          instructions: 'Approve the prompt',
          provider: 'paynow',
        }),
      verifyCallback: () => true,
      pollStatus: () => Promise.resolve(pollResult),
    };
    let payments: PaymentsService;
    let fees: FeesService;
    let adminFees: AdminFeesService;

    beforeAll(() => {
      const config = new ConfigService<Env, true>(ENV);
      payments = new PaymentsService(prisma, config, gateway, ledger);
      fees = new FeesService(
        prisma,
        ledger,
        standing,
        statements,
        new PaymentStatusService(prisma, gateway, ledger),
        gateway,
      );
      adminFees = new AdminFeesService(prisma, ledger, standing, fees);
    });

    async function owing(label: string, cents: number) {
      const provider = await makeProvider(label);
      await entry(provider.id, 'booking_fee', cents, '2026-10-10');
      return provider;
    }

    it('starts a payment of the whole balance by default, without crediting it yet', async () => {
      pollResult = 'pending';
      const { id } = await owing('Pays all', 250);
      const result = await fees.pay(id, { payChannel: 'ecocash', payerPhone: '0771234567' });
      expect(result).toMatchObject({ amountUsdCents: 250, pending: true });
      expect(result.reference).toMatch(/^FEE-/);
      expect(await ledger.balance(id)).toBe(250);
      const row = await prisma.payment.findFirstOrThrow({ where: { feeProviderId: id } });
      expect(row).toMatchObject({ status: 'pending', amountUsdCents: 250, channel: 'ecocash' });
    });

    it('accepts a part payment of at least $1 and refuses the rest', async () => {
      const { id } = await owing('Pays part', 250);
      await expect(fees.pay(id, { amountUsdCents: 50, payerPhone: '0771234567' })).rejects.toThrow(
        'smallest payment is $1.00',
      );
      await expect(fees.pay(id, { amountUsdCents: 251, payerPhone: '0771234567' })).rejects.toThrow(
        'You owe $2.50',
      );
      await expect(
        fees.pay(id, { amountUsdCents: 100, payerPhone: '0771234567' }),
      ).resolves.toMatchObject({ amountUsdCents: 100 });
    });

    it('lets a balance under $1 be paid in full, and refuses when nothing is owed', async () => {
      const small = await owing('Small', 60);
      await expect(fees.pay(small.id, { payerPhone: '0771234567' })).resolves.toMatchObject({
        amountUsdCents: 60,
      });
      const clear = await makeProvider('Nothing owed');
      await expect(fees.pay(clear.id, { payerPhone: '0771234567' })).rejects.toThrow(
        "don't owe any fees",
      );
    });

    it('credits the balance exactly once when the callback and the poll both report paid', async () => {
      const { id } = await owing('Both paths', 250);
      const started = await fees.pay(id, { amountUsdCents: 150, payerPhone: '0771234567' });
      pollResult = 'paid';

      // The poll and Paynow's callback land at the same moment, twice over.
      const callback = () =>
        payments.receivePaynowCallback({
          reference: started.reference ?? '',
          amount: '1.50',
          status: 'Paid',
          paynowreference: 'PN-1',
        });
      await Promise.all([
        fees.paymentStatusFor(id),
        callback(),
        fees.paymentStatusFor(id),
        callback(),
      ]);
      await callback();

      expect(await ledger.balance(id)).toBe(100);
      const credits = await prisma.feeLedgerEntry.findMany({
        where: { providerId: id, kind: 'payment' },
      });
      expect(credits).toHaveLength(1);
      expect(credits[0]).toMatchObject({ amountUsdCents: -150 });
      const paidRow = await prisma.payment.findFirstOrThrow({
        where: { feeProviderId: id, status: 'paid' },
      });
      expect(credits[0]?.paymentId).toBe(paidRow.id);
      expect(await fees.paymentStatusFor(id)).toEqual({ status: 'paid', balanceUsdCents: 100 });
    });

    it('rejects a callback whose amount does not match, and a failed payment credits nothing', async () => {
      const { id } = await owing('Mismatch', 250);
      pollResult = 'pending';
      const started = await fees.pay(id, { amountUsdCents: 200, payerPhone: '0771234567' });
      await expect(
        payments.receivePaynowCallback({
          reference: started.reference ?? '',
          amount: '0.50',
          status: 'Paid',
        }),
      ).rejects.toThrow('amount mismatch');
      await payments.receivePaynowCallback({
        reference: started.reference ?? '',
        amount: '2.00',
        status: 'Cancelled',
      });
      // A late "paid" for a payment that already failed is not applied.
      await payments.receivePaynowCallback({
        reference: started.reference ?? '',
        amount: '2.00',
        status: 'Paid',
      });
      expect(await ledger.balance(id)).toBe(250);
    });

    it('settles at once on the dev gateway that confirms instantly', async () => {
      const instant: PaymentGatewayPort = {
        createCheckout: () =>
          Promise.resolve({ externalRef: 'fake-1', status: 'held', provider: 'fake-ecocash' }),
        verifyCallback: () => false,
        pollStatus: () => Promise.resolve('paid'),
      };
      const instantFees = new FeesService(
        prisma,
        ledger,
        standing,
        statements,
        new PaymentStatusService(prisma, instant, ledger),
        instant,
      );
      const { id } = await owing('Instant', 250);
      const result = await instantFees.pay(id, { payerPhone: '0771234567' });
      expect(result.pending).toBe(false);
      expect(await ledger.balance(id)).toBe(0);
    });

    it('lets a restricted provider pay, and trading resumes once it settles', async () => {
      const provider = await makeProvider('Restricted payer');
      await entry(provider.id, 'booking_fee', 200, '2026-09-10');
      await statements.generateMissing(at('2026-11-10'));
      const now = at('2026-11-10');
      expect(await standing.isRestricted(provider.id, now)).toBe(true);

      pollResult = 'paid';
      const started = await fees.pay(provider.id, { payerPhone: '0771234567' });
      await payments.receivePaynowCallback({
        reference: started.reference ?? '',
        amount: '2.00',
        status: 'Paid',
      });
      expect(await standing.isRestricted(provider.id, now)).toBe(false);
    });

    it('summarises the balance, this month so far and the latest statement', async () => {
      const { id } = await makeProvider('Summary');
      await entry(id, 'booking_fee', 130, '2026-10-10');
      await statements.generateMissing(at('2026-11-01'));
      // "This month" is the real current Harare month, so create real entries now.
      await ledger.chargeBooking(prisma, {
        providerId: id,
        bookingId: randomUUID(),
        priceUsdCents: 2000,
      });
      const summary = await fees.summary(id);
      expect(summary.balanceUsdCents).toBe(130 + 60);
      expect(summary.thisMonth).toMatchObject({ jobCount: 1, feesUsdCents: 60 });
      expect(summary.latestStatement).toMatchObject({ month: '2026-10', closingUsdCents: 130 });
      expect(summary.minPaymentUsdCents).toBe(100);
    });

    it('records an outside payment and an adjustment through the ledger, with the admin and a note', async () => {
      const { id } = await owing('Admin actions', 500);
      const admin = await prisma.adminUser.create({
        data: {
          email: `fees-${randomUUID().slice(0, 8)}@example.com`,
          passwordHash: 'x',
          displayName: 'Fee Admin',
          role: 'finance',
        },
      });
      try {
        const afterPayment = await adminFees.recordPayment(admin.id, id, {
          amountUsdCents: 200,
          method: 'cash',
          note: 'Paid at the office',
        });
        expect(afterPayment.provider.balanceUsdCents).toBe(300);
        expect(afterPayment.provider.lastPaymentUsdCents).toBe(200);
        const afterAdjustment = await adminFees.adjust(admin.id, id, {
          amountUsdCents: -50,
          note: 'Goodwill credit',
        });
        expect(afterAdjustment.provider.balanceUsdCents).toBe(250);

        const rows = await prisma.feeLedgerEntry.findMany({
          where: { providerId: id, createdByAdminId: admin.id },
          orderBy: { createdAt: 'asc' },
        });
        expect(rows.map((r) => [r.kind, r.amountUsdCents, r.note])).toEqual([
          ['payment', -200, 'Cash: Paid at the office'],
          ['adjustment', -50, 'Goodwill credit'],
        ]);
        const audit = await prisma.auditLog.findMany({
          where: { adminActorId: admin.id, targetId: id },
        });
        expect(audit.map((a) => a.action)).toEqual([
          'FEES payment $2.00 (cash): Paid at the office',
          'FEES adjustment -$0.50: Goodwill credit',
        ]);
      } finally {
        await prisma.auditLog.deleteMany({ where: { adminActorId: admin.id } });
        await prisma.feeLedgerEntry.deleteMany({ where: { createdByAdminId: admin.id } });
        await prisma.adminUser.delete({ where: { id: admin.id } });
      }
    });

    it('lists balances worst first, filters, and exports a CSV', async () => {
      const a = await owing('List Alpha', 400);
      const b = await owing('List Beta', 900);
      await statements.generateMissing(at('2026-11-10'));
      const page = await adminFees.list({ q: 'List ', page: { limit: 10, offset: 0 } });
      expect(page.items.map((r) => r.displayName)).toEqual(['List Beta', 'List Alpha']);
      expect(page.items[0]).toMatchObject({ providerId: b.id, balanceUsdCents: 900 });
      const restricted = await adminFees.list({
        q: 'List ',
        filter: 'restricted',
        page: { limit: 10, offset: 0 },
      });
      // Dated October: due 5 Nov, not yet 30 days past, so none of them is restricted.
      expect(restricted.items).toHaveLength(0);
      expect((await adminFees.csv()).split('\r\n')[0]).toContain('Balance (USD)');
      expect((await adminFees.detail(a.id)).entries).toHaveLength(1);
    });
  });
});

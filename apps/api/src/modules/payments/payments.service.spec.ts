import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from './payments.service';
import type { PaymentGatewayPort } from './payment-gateway.port';
import type { Env } from '../../config/env';

const TEST_DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://sc:sc@localhost:5433/sc_test';
const BASE_ENV: Env = {
  NODE_ENV: 'test',
  PORT: 4000,
  TRUST_PROXY_HOPS: 1,
  ADMIN_MFA_REQUIRED: false,
  DATABASE_URL: TEST_DATABASE_URL,
  REDIS_URL: 'redis://localhost:6380',
  STORAGE_DRIVER: 'local',
  UPLOAD_DIR: 'uploads',
  S3_REGION: 'auto',
  JWT_ACCESS_SECRET: 'test-access-secret-at-least-32-characters-long',
  JWT_REFRESH_PEPPER: 'test-refresh-pepper-at-least-32-characters-long',
  ADMIN_JWT_ACCESS_SECRET: 'test-admin-access-secret-at-least-32-characters-long',
  ADMIN_JWT_REFRESH_PEPPER: 'test-admin-refresh-pepper-at-least-32-characters-long',
  ADMIN_WEB_ORIGIN: 'http://localhost:5173',
  PAYMENT_PROVIDER: 'fake',
  PESEPAY_SANDBOX: false,
  PESEPAY_CURRENCY_CODE: 'USD',
  PESEPAY_MOBILE_METHOD_CODE: 'PZW211',
  COIN_USD_CENTS: 50,
  CASH_OUT_MIN_USD_CENTS: 500,
  OSRM_BASE_URL: 'https://router.project-osrm.org',
  EXPO_PUSH_API_URL: 'https://push.invalid/send',
  ANDROID_PLAY_STORE_URL: 'https://play.google.com/store/apps/details?id=zw.co.stylistscenter.app',
};

const uniquePhone = () => `+263779${String(Math.floor(Math.random() * 900000) + 100000)}`;

describe("PaymentsService O'mari OTP", () => {
  let prisma: PrismaService;
  let clientId: string;
  let strangerId: string;
  let providerProfileId: string;
  let serviceId: string;
  const submitOtp = vi.fn<(otpUrl: string, otp: string) => Promise<void>>();
  let service: PaymentsService;

  beforeAll(async () => {
    const config = new ConfigService<Env, true>(BASE_ENV);
    prisma = new PrismaService(config);
    await prisma.onModuleInit();
    const gateway: PaymentGatewayPort = {
      createCheckout: () => Promise.reject(new Error('not used')),
      verifyCallback: () => false,
      pollStatus: () => Promise.resolve('pending'),
      submitOtp,
    };
    service = new PaymentsService(prisma, config, gateway);

    const city = await prisma.city.create({
      data: {
        name: `otp-test-${String(Date.now())}`,
        timezone: 'Africa/Harare',
        centroidLat: -17.8252,
        centroidLng: 31.0335,
        bboxWest: 30.9,
        bboxSouth: -18.0,
        bboxEast: 31.2,
        bboxNorth: -17.6,
      },
    });
    const makeUser = async (displayName: string) =>
      (await prisma.user.create({ data: { phone: uniquePhone(), displayName, cityId: city.id } }))
        .id;
    clientId = await makeUser('Payer');
    strangerId = await makeUser('Stranger');
    const providerUserId = await makeUser('Stylist');
    const category = await prisma.category.create({
      data: { name: `otp-cat-${String(Date.now())}` },
    });
    providerProfileId = (
      await prisma.providerProfile.create({
        data: {
          userId: providerUserId,
          categoryId: category.id,
          displayName: 'Stylist',
          initials: 'ST',
          tint: '#abc',
          areaName: 'Area',
          latitude: -17.8,
          longitude: 31.03,
          cityId: city.id,
          workingHoursLabel: 'Weekdays',
        },
      })
    ).id;
    serviceId = (
      await prisma.service.create({
        data: {
          providerId: providerProfileId,
          name: 'Fade',
          durationMinutes: 30,
          priceUsdCents: 500,
        },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  // Each booking takes its own slot: the provider's bookings may not overlap.
  let slot = 0;
  async function bookingAwaitingOtp(status = 'pending') {
    slot += 1;
    const reference = `OTP-${String(Date.now())}-${String(Math.random()).slice(2, 8)}`;
    const startsAt = new Date(Date.now() + (48 + slot) * 60 * 60_000);
    const booking = await prisma.booking.create({
      data: {
        reference,
        clientId,
        providerId: providerProfileId,
        serviceId,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 30 * 60_000),
        paymentMethod: 'ecocash',
        priceUsdCents: 500,
      },
    });
    await prisma.payment.create({
      data: {
        bookingId: booking.id,
        provider: 'paynow',
        status,
        amountUsdCents: 500,
        reference,
        channel: 'omari',
        otpUrl: 'https://www.paynow.co.zw/interface/remoteotp/?guid=abc',
      },
    });
    return reference;
  }

  it("forwards the payer's code to the stored OTP URL", async () => {
    submitOtp.mockResolvedValueOnce();
    const reference = await bookingAwaitingOtp();

    await service.submitOtp(clientId, { reference, otp: '012345' });

    expect(submitOtp).toHaveBeenCalledWith(
      'https://www.paynow.co.zw/interface/remoteotp/?guid=abc',
      '012345',
    );
  });

  it("answers someone else's payment as not found, without calling the gateway", async () => {
    submitOtp.mockClear();
    const reference = await bookingAwaitingOtp();

    await expect(service.submitOtp(strangerId, { reference, otp: '012345' })).rejects.toMatchObject(
      { status: 404 },
    );
    expect(submitOtp).not.toHaveBeenCalled();
  });

  it('refuses a code once the payment has stopped waiting for one', async () => {
    submitOtp.mockClear();
    const reference = await bookingAwaitingOtp('held');

    await expect(service.submitOtp(clientId, { reference, otp: '012345' })).rejects.toMatchObject({
      status: 400,
    });
    expect(submitOtp).not.toHaveBeenCalled();
  });
});

import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { PushService } from './push.service';
import { PrismaService } from '../prisma/prisma.service';
import type { Env } from '../../config/env';

const TEST_DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://sc:sc@localhost:5433/sc_test';
const BASE_ENV: Env = {
  NODE_ENV: 'test',
  PORT: 4000,
  DATABASE_URL: TEST_DATABASE_URL,
  REDIS_URL: 'redis://localhost:6380',
  UPLOAD_DIR: 'uploads',
  JWT_ACCESS_SECRET: 'test-access-secret-at-least-32-characters-long',
  JWT_REFRESH_PEPPER: 'test-refresh-pepper-at-least-32-characters-long',
  ADMIN_JWT_ACCESS_SECRET: 'test-admin-access-secret-at-least-32-characters-long',
  ADMIN_JWT_REFRESH_PEPPER: 'test-admin-refresh-pepper-at-least-32-characters-long',
  ADMIN_WEB_ORIGIN: 'http://localhost:5173',
  PAYMENT_PROVIDER: 'fake',
  COIN_USD_CENTS: 50,
  CASH_OUT_MIN_USD_CENTS: 500,
  OSRM_BASE_URL: 'https://router.project-osrm.org',
  // Never the real service: these tests must not send anything to a device.
  EXPO_PUSH_API_URL: 'https://push.invalid/send',
};

/**
 * PushService always sends a JSON string body, but `RequestInit['body']` is a
 * union wide enough to include Blob and streams — so reading it needs the
 * narrowing rather than a String() coercion that would quietly produce
 * "[object Object]" if that ever stopped being true.
 */
function sentMessages(init: RequestInit | undefined): { to: string }[] {
  const body = init?.body;
  if (typeof body !== 'string') throw new Error('expected a JSON string body');
  return JSON.parse(body) as { to: string }[];
}

/** Expo replies with one ticket per message, positionally matched to the batch. */
function ticketsFor(...errors: (string | null)[]) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        data: errors.map((error) =>
          error ? { status: 'error', message: error, details: { error } } : { status: 'ok' },
        ),
      }),
  } as unknown as Response;
}

describe('PushService', () => {
  let prisma: PrismaService;
  let push: PushService;
  let cityId: string;
  let userId: string;

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService<Env, true>(BASE_ENV));
    await prisma.onModuleInit();

    const city = await prisma.city.create({
      data: {
        name: `push-test-${String(Date.now())}`,
        timezone: 'Africa/Harare',
        centroidLat: -17.8252,
        centroidLng: 31.0335,
        bboxWest: 30.9,
        bboxSouth: -18.0,
        bboxEast: 31.2,
        bboxNorth: -17.6,
      },
    });
    cityId = city.id;

    const user = await prisma.user.create({
      data: {
        phone: `+263782${String(Math.floor(Math.random() * 900000) + 100000)}`,
        displayName: 'Push Target',
        cityId,
      },
    });
    userId = user.id;

    push = new PushService(prisma, new ConfigService<Env, true>(BASE_ENV));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await prisma.devicePushToken.deleteMany({ where: { userId } });
  });

  afterAll(async () => {
    await prisma.devicePushToken.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.city.delete({ where: { id: cityId } });
    await prisma.onModuleDestroy();
  });

  const addToken = (expoPushToken: string) =>
    prisma.devicePushToken.create({ data: { userId, expoPushToken, platform: 'android' } });

  it('sends one message per registered device', async () => {
    await addToken('ExponentPushToken[aaa]');
    await addToken('ExponentPushToken[bbb]');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(ticketsFor(null, null));

    await push.sendToUser(userId, { title: 'New job offer', body: 'Braids · $20' });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const body = sentMessages(fetchSpy.mock.calls[0]?.[1]);
    expect(body).toHaveLength(2);
    expect(body.map((m) => m.to).sort()).toEqual([
      'ExponentPushToken[aaa]',
      'ExponentPushToken[bbb]',
    ]);
  });

  it('does not call Expo at all when the user has no devices', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await push.sendToUser(userId, { title: 'Nobody', body: 'is listening' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('deletes tokens Expo reports as unregistered, and keeps the rest', async () => {
    // Without this the table only grows: every reinstall strands a token that
    // can never receive anything again.
    await addToken('ExponentPushToken[dead]');
    await addToken('ExponentPushToken[live]');
    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
      const sent = sentMessages(init);
      return Promise.resolve(
        ticketsFor(...sent.map((m) => (m.to.includes('dead') ? 'DeviceNotRegistered' : null))),
      );
    });

    await push.sendToUser(userId, { title: 'Prune', body: 'me' });

    const left = await prisma.devicePushToken.findMany({ where: { userId } });
    expect(left.map((t) => t.expoPushToken)).toEqual(['ExponentPushToken[live]']);
  });

  it('keeps a token whose delivery failed for any other reason', async () => {
    // A message that was merely too big says nothing about the device still
    // existing, so deleting on any error would silently disable that device.
    await addToken('ExponentPushToken[toobig]');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(ticketsFor('MessageTooBig'));

    await push.sendToUser(userId, { title: 'Big', body: 'x'.repeat(10) });

    expect(await prisma.devicePushToken.count({ where: { userId } })).toBe(1);
  });

  it('never throws, because the action it reports on has already happened', async () => {
    await addToken('ExponentPushToken[ccc]');
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));

    // A booking is confirmed whether or not the notification about it lands.
    await expect(
      push.sendToUser(userId, { title: 'Booking confirmed', body: 'anything' }),
    ).resolves.toBeUndefined();
  });

  it('survives a non-2xx from Expo without dropping tokens', async () => {
    await addToken('ExponentPushToken[ddd]');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 502,
      json: () => Promise.reject(new Error('not json')),
    } as unknown as Response);

    await expect(push.sendToUser(userId, { title: 'x', body: 'y' })).resolves.toBeUndefined();
    expect(await prisma.devicePushToken.count({ where: { userId } })).toBe(1);
  });
});

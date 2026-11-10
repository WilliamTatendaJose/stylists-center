import { HttpException } from '@nestjs/common';
import Redis from 'ioredis';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ADMIN_LOGIN_LOCK_SECONDS,
  LoginAttemptsService,
  MAX_FAILED_ADMIN_LOGINS,
} from './login-attempts.service';

/** Against real Redis (docker-compose / CI service on 6380), like the other specs. */
const redis = new Redis('redis://localhost:6380', { maxRetriesPerRequest: null });
const attempts = new LoginAttemptsService(redis);
const email = `lockout-${String(Date.now())}@example.com`;

describe('LoginAttemptsService', () => {
  beforeEach(async () => {
    await attempts.clear(email);
  });
  afterAll(async () => {
    await attempts.clear(email);
    redis.disconnect();
  });

  it('allows attempts until the limit, then locks with a 429', async () => {
    for (let i = 0; i < MAX_FAILED_ADMIN_LOGINS - 1; i += 1) {
      await attempts.recordFailure(email);
      await expect(attempts.assertNotLocked(email)).resolves.toBeUndefined();
    }
    await attempts.recordFailure(email);
    const error = await attempts.assertNotLocked(email).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(429);
    expect((error as HttpException).message).toMatch(/Try again in 15 minutes/);
  });

  it('treats the email case- and whitespace-insensitively', async () => {
    for (let i = 0; i < MAX_FAILED_ADMIN_LOGINS; i += 1) {
      await attempts.recordFailure(`  ${email.toUpperCase()} `);
    }
    await expect(attempts.assertNotLocked(email)).rejects.toBeInstanceOf(HttpException);
  });

  it('expires the lock after the lock period', async () => {
    for (let i = 0; i < MAX_FAILED_ADMIN_LOGINS; i += 1) await attempts.recordFailure(email);
    const ttl = await redis.ttl(`admin-login-failures:${email}`);
    expect(ttl).toBeGreaterThan(ADMIN_LOGIN_LOCK_SECONDS - 5);
    expect(ttl).toBeLessThanOrEqual(ADMIN_LOGIN_LOCK_SECONDS);
  });

  it('clears the count on a successful sign-in', async () => {
    for (let i = 0; i < MAX_FAILED_ADMIN_LOGINS; i += 1) await attempts.recordFailure(email);
    await attempts.clear(email);
    await expect(attempts.assertNotLocked(email)).resolves.toBeUndefined();
  });
});

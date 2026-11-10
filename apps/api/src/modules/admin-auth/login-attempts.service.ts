import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';

/** Failed sign-ins allowed per email inside the window before it locks. */
export const MAX_FAILED_ADMIN_LOGINS = 5;
/** How long failures are remembered, and how long a locked email stays locked. */
export const ADMIN_LOGIN_LOCK_SECONDS = 15 * 60;

/**
 * Per-account brute-force protection for the admin console, kept in Redis so
 * it survives a restart and holds across replicas. This complements the
 * per-IP @Throttle on the login route: the IP limit stops one machine
 * hammering, this stops a distributed guess against a single account.
 *
 * The trade-off is that anyone who knows an admin email can lock it for 15
 * minutes. That is accepted: a short lockout is recoverable, a guessed
 * password on an account that moves money is not.
 */
@Injectable()
export class LoginAttemptsService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  private key(email: string): string {
    return `admin-login-failures:${email.trim().toLowerCase()}`;
  }

  /** Throws 429 while the email is locked; call before checking the password. */
  async assertNotLocked(email: string): Promise<void> {
    const key = this.key(email);
    const failures = Number((await this.redis.get(key)) ?? 0);
    if (failures < MAX_FAILED_ADMIN_LOGINS) return;
    const ttl = await this.redis.ttl(key);
    const minutes = Math.max(1, Math.ceil((ttl > 0 ? ttl : ADMIN_LOGIN_LOCK_SECONDS) / 60));
    throw new HttpException(
      `Too many failed sign-in attempts. Try again in ${String(minutes)} minute${minutes === 1 ? '' : 's'}.`,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  async recordFailure(email: string): Promise<void> {
    const key = this.key(email);
    const failures = await this.redis.incr(key);
    // The window starts at the first failure; the lock itself always lasts
    // the full period from the failure that tripped it.
    if (failures === 1 || failures >= MAX_FAILED_ADMIN_LOGINS) {
      await this.redis.expire(key, ADMIN_LOGIN_LOCK_SECONDS);
    }
  }

  async clear(email: string): Promise<void> {
    await this.redis.del(this.key(email));
  }
}

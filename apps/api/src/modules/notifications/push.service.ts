import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Expo accepts at most 100 messages per request. Larger sends are chunked
 * rather than truncated — a user with more devices than this is implausible
 * today, but silently dropping notifications would be a miserable bug to find.
 */
const MAX_MESSAGES_PER_REQUEST = 100;

/** Expo's own tag for "this token belongs to an app that is no longer installed". */
const DEVICE_NOT_REGISTERED = 'DeviceNotRegistered';

export interface PushMessage {
  title: string;
  body: string;
  /**
   * Travels to the device untouched and comes back when the notification is
   * tapped, which is how the app knows where to navigate. Keep it small — Expo
   * caps the whole payload at 4KiB — and put ids in it, not rendered text.
   */
  data?: Record<string, string>;
}

interface ExpoTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

/**
 * Sends push notifications through Expo's push service.
 *
 * Deliberately best-effort: every caller is a real user action (a booking was
 * accepted, a message was sent) that has already been committed by the time we
 * get here. A push that fails must never turn a completed action into an error,
 * so nothing in this class throws — failures are logged and swallowed.
 *
 * Note this is a *notification*, not the delivery mechanism the app relies on.
 * The socket layer remains the source of truth for a foregrounded app; this
 * exists for the case the socket cannot cover, which is the app being closed.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * Fire-and-forget send to every device a user has registered.
   *
   * Returns void and never rejects. Callers should not await this in a way
   * that delays their own response — the notification is a side effect of the
   * action, not part of it.
   */
  async sendToUser(userId: string, message: PushMessage): Promise<void> {
    try {
      const tokens = await this.prisma.devicePushToken.findMany({
        where: { userId },
        select: { expoPushToken: true },
      });
      if (tokens.length === 0) return;

      await this.send(
        tokens.map((t) => t.expoPushToken),
        message,
      );
    } catch (error) {
      this.logger.error(`Failed to push to user ${userId}`, error);
    }
  }

  private async send(tokens: string[], message: PushMessage): Promise<void> {
    const url = this.config.get('EXPO_PUSH_API_URL', { infer: true });
    const accessToken = this.config.get('EXPO_ACCESS_TOKEN', { infer: true });

    for (let i = 0; i < tokens.length; i += MAX_MESSAGES_PER_REQUEST) {
      const chunk = tokens.slice(i, i + MAX_MESSAGES_PER_REQUEST);
      const payload = chunk.map((to) => ({
        to,
        title: message.title,
        body: message.body,
        data: message.data,
        // Expo's default is 'default'; being explicit keeps Android from
        // silently downgrading time-sensitive offers to a batched delivery.
        priority: 'high' as const,
        channelId: 'default',
      }));

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        this.logger.warn(`Expo push rejected the batch: ${String(res.status)}`);
        continue;
      }

      const parsed = (await res.json()) as { data?: ExpoTicket[] };
      await this.pruneDeadTokens(chunk, parsed.data ?? []);
    }
  }

  /**
   * Deletes tokens Expo says are dead.
   *
   * Without this the table only ever grows: every reinstall and every cleared
   * app leaves a token behind that can never receive anything, and each one
   * costs a slot in every future send for that user. Expo tells us exactly
   * which ones, so there is no reason to keep them.
   */
  private async pruneDeadTokens(tokens: string[], tickets: ExpoTicket[]): Promise<void> {
    const dead = tokens.filter(
      (_, index) => tickets[index]?.details?.error === DEVICE_NOT_REGISTERED,
    );
    if (dead.length === 0) return;

    await this.prisma.devicePushToken.deleteMany({ where: { expoPushToken: { in: dead } } });
    this.logger.log(`Removed ${String(dead.length)} unregistered push token(s)`);
  }
}

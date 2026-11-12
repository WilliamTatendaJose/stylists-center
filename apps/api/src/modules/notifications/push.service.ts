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

/**
 * How long after a send to ask Expo what Firebase/Apple did with it. A ticket
 * only means Expo queued the push; whether it reached Google or Apple, and why
 * not, is in the receipt, which is usually ready within seconds.
 */
const RECEIPT_DELAY_MS = 30_000;

/** Expo accepts at most 1000 receipt ids per request. */
const MAX_RECEIPTS_PER_REQUEST = 1000;

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

export interface PushTestResult {
  /** Devices registered for this user. 0 means the app never registered a token. */
  devices: number;
  /** Devices Expo accepted the test for. */
  delivered: number;
  /** Expo's error codes for the rest, e.g. InvalidCredentials, DeviceNotRegistered. */
  errors: string[];
}

interface ExpoReceipt {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
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

  /**
   * Sends a test notification to every device of a user and reports exactly
   * what Expo said for each one. Unlike normal sends this surfaces failures,
   * so a person can check from the app that notifications reach them, and the
   * reason when they don't (for example Android push credentials not set up).
   */
  async sendTest(userId: string): Promise<PushTestResult> {
    const tokens = await this.prisma.devicePushToken.findMany({
      where: { userId },
      select: { expoPushToken: true },
    });
    if (tokens.length === 0) return { devices: 0, delivered: 0, errors: [] };
    const tickets = await this.send(
      tokens.map((t) => t.expoPushToken),
      {
        title: 'Notifications are working',
        body: 'This is a test from StylistsCenter. You will get booking, message and payment updates like this.',
        data: { type: 'test' },
      },
    );
    const errors = tickets
      .filter((ticket) => ticket.status === 'error')
      .map((ticket) => ticket.details?.error ?? ticket.message ?? 'Unknown error');
    return { devices: tokens.length, delivered: tickets.length - errors.length, errors };
  }

  private async send(tokens: string[], message: PushMessage): Promise<ExpoTicket[]> {
    const all: ExpoTicket[] = [];
    const pending = new Map<string, string>();
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
        all.push(
          ...chunk.map((): ExpoTicket => ({
            status: 'error',
            message: `HTTP ${String(res.status)}`,
          })),
        );
        continue;
      }

      const parsed = (await res.json()) as { data?: ExpoTicket[] };
      const tickets = parsed.data ?? [];
      all.push(...tickets);
      tickets.forEach((ticket, index) => {
        const token = chunk[index];
        if (ticket.status === 'ok' && ticket.id && token) pending.set(ticket.id, token);
      });
      await this.pruneDeadTokens(chunk, tickets);
      // Anything other than an uninstalled app is a setup problem worth seeing
      // in the logs, e.g. InvalidCredentials when Android (FCM) credentials
      // are missing, which would otherwise make every Android push vanish.
      const problems = tickets.filter(
        (t) => t.status === 'error' && t.details?.error !== DEVICE_NOT_REGISTERED,
      );
      if (problems.length > 0) {
        const reasons = [
          ...new Set(problems.map((t) => t.details?.error ?? t.message ?? 'unknown')),
        ];
        this.logger.warn(`Expo refused ${String(problems.length)} push(es): ${reasons.join(', ')}`);
      }
    }
    if (pending.size > 0) {
      setTimeout(() => void this.checkReceipts(pending), RECEIPT_DELAY_MS).unref();
    }
    return all;
  }

  /**
   * Asks Expo what happened to pushes it accepted. This is where "the send
   * worked but nothing arrived" shows up: Firebase refusing the message
   * (credentials, sender mismatch, size), or the app being uninstalled, which
   * Firebase mostly reports here rather than on the ticket. Dead tokens are
   * removed and every other failure is logged with its reason.
   *
   * Never throws, like the rest of this class. Public for tests.
   */
  async checkReceipts(ticketToToken: Map<string, string>): Promise<void> {
    try {
      const url = this.config
        .get('EXPO_PUSH_API_URL', { infer: true })
        .replace(/\/send$/, '/getReceipts');
      const accessToken = this.config.get('EXPO_ACCESS_TOKEN', { infer: true });
      const ids = [...ticketToToken.keys()];
      const dead: string[] = [];
      const reasons: string[] = [];
      for (let i = 0; i < ids.length; i += MAX_RECEIPTS_PER_REQUEST) {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify({ ids: ids.slice(i, i + MAX_RECEIPTS_PER_REQUEST) }),
        });
        if (!res.ok) {
          this.logger.warn(`Expo receipts request failed: ${String(res.status)}`);
          continue;
        }
        const parsed = (await res.json()) as { data?: Record<string, ExpoReceipt> };
        for (const [id, receipt] of Object.entries(parsed.data ?? {})) {
          if (receipt.status !== 'error') continue;
          const reason = receipt.details?.error ?? receipt.message ?? 'unknown';
          const token = ticketToToken.get(id);
          if (reason === DEVICE_NOT_REGISTERED && token) dead.push(token);
          else reasons.push(reason);
        }
      }
      if (dead.length > 0) {
        await this.prisma.devicePushToken.deleteMany({ where: { expoPushToken: { in: dead } } });
        this.logger.log(`Removed ${String(dead.length)} unregistered push token(s)`);
      }
      if (reasons.length > 0) {
        this.logger.warn(
          `${String(reasons.length)} push(es) not delivered by Firebase/Apple: ${[...new Set(reasons)].join(', ')}`,
        );
      }
    } catch (error) {
      this.logger.error('Failed to check push receipts', error);
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

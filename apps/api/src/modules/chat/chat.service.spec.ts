import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { describe, expect, it, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { ChatService } from './chat.service';
import { SocketEmitterService } from '../realtime/socket-emitter.service';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../notifications/push.service';
import type { Env } from '../../config/env';
import { AttachmentStorageService } from './attachment-storage.service';

/** Against real Postgres (sc_test) — no Testcontainers daemon in this sandbox. */
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
  AUTH_DEV_OTP: '000000',
  INFOBIP_DEFAULT_CHANNEL: 'whatsapp',
  PAYMENT_PROVIDER: 'fake',
  COIN_USD_CENTS: 50,
  CASH_OUT_MIN_USD_CENTS: 500,
  OSRM_BASE_URL: 'https://router.project-osrm.org',
  EXPO_PUSH_API_URL: 'https://push.invalid/send',
};

describe('ChatService', () => {
  let prisma: PrismaService;
  let chat: ChatService;
  let cityId: string;
  let categoryId: string;
  let clientId: string;
  let providerId: string;
  let providerUserId: string;
  let otherClientId: string;

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService<Env, true>(BASE_ENV));
    await prisma.onModuleInit();

    const city = await prisma.city.create({
      data: {
        name: `chat-test-${String(Date.now())}`,
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

    const category = await prisma.category.create({
      data: { name: `ChatCat-${String(Date.now())}` },
    });
    categoryId = category.id;

    const client = await prisma.user.create({
      data: {
        phone: `+263776${String(Math.floor(Math.random() * 900000) + 100000)}`,
        displayName: 'Chat Client',
        cityId,
      },
    });
    clientId = client.id;

    const otherClient = await prisma.user.create({
      data: {
        phone: `+263777${String(Math.floor(Math.random() * 900000) + 100000)}`,
        displayName: 'Other Client',
        cityId,
      },
    });
    otherClientId = otherClient.id;

    const providerUser = await prisma.user.create({
      data: {
        phone: `+263778${String(Math.floor(Math.random() * 900000) + 100000)}`,
        displayName: 'Chat Provider',
        cityId,
      },
    });
    providerUserId = providerUser.id;
    const provider = await prisma.providerProfile.create({
      data: {
        userId: providerUser.id,
        displayName: 'Chat Provider',
        tint: '#222222',
        initials: 'CP',
        categoryId,
        areaName: 'Test area',
        latitude: -17.793,
        longitude: 31.0345,
        cityId,
        workingHoursLabel: 'Always',
      },
    });
    providerId = provider.id;
  });

  afterAll(async () => {
    await prisma.message.deleteMany({ where: { conversation: { providerUserId } } });
    await prisma.conversation.deleteMany({ where: { providerUserId } });
    await prisma.providerProfile.delete({ where: { id: providerId } });
    await prisma.user.deleteMany({
      where: { id: { in: [clientId, otherClientId, providerUserId] } },
    });
    await prisma.category.delete({ where: { id: categoryId } });
    await prisma.city.delete({ where: { id: cityId } });
    await prisma.onModuleDestroy();
  });

  beforeEach(() => {
    const socketEmitter = new SocketEmitterService();
    const attachmentStorage = {
      saveMany: vi.fn((files: { originalname: string; mimetype: string; size: number }[]) =>
        Promise.resolve(
          files.map((file, index) => ({
            url: `/uploads/test-${String(index)}.txt`,
            name: file.originalname,
            mimeType: file.mimetype,
            sizeBytes: file.size,
          })),
        ),
      ),
    } as unknown as AttachmentStorageService;
    chat = new ChatService(
      prisma,
      socketEmitter,
      attachmentStorage,
      new PushService(prisma, new ConfigService<Env, true>(BASE_ENV)),
    );
  });

  it('creates a conversation with a provider on first message, and reuses it on a second call', async () => {
    const first = await chat.getOrCreateByProvider(clientId, providerId);
    expect(first.counterpartyName).toBe('Chat Provider');
    expect(first.unreadCount).toBe(0);

    const second = await chat.getOrCreateByProvider(clientId, providerId);
    expect(second.id).toBe(first.id);
  });

  it('sends a message, marks it "mine" for the sender, and shows it in the thread', async () => {
    const conversation = await chat.getOrCreateByProvider(clientId, providerId);
    const sent = await chat.sendMessage(conversation.id, clientId, {
      text: 'Hi, are you free today?',
    });
    expect(sent.mine).toBe(true);
    expect(sent.text).toBe('Hi, are you free today?');
    expect(sent.read).toBe(false);
    expect(sent.attachments).toEqual([]);

    const messages = await chat.getMessages(conversation.id, clientId);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.mine).toBe(true);
  });

  it('sendMessage refuses a client who is not party to the conversation', async () => {
    const conversation = await chat.getOrCreateByProvider(clientId, providerId);
    await expect(
      chat.sendMessage(conversation.id, otherClientId, { text: 'not my conversation' }),
    ).rejects.toThrow();
  });

  it('sends an attachment-only message and uses its filename in the inbox preview', async () => {
    const conversation = await chat.getOrCreateByProvider(clientId, providerId);
    const sent = await chat.sendMessage(conversation.id, clientId, { text: '' }, [
      {
        buffer: Buffer.from('appointment notes'),
        mimetype: 'text/plain',
        originalname: 'appointment-notes.txt',
        size: 17,
      },
    ]);

    expect(sent.text).toBe('');
    expect(sent.attachments[0]?.name).toBe('appointment-notes.txt');
    const inbox = await chat.list(providerUserId);
    expect(inbox.find((row) => row.id === conversation.id)?.lastMessagePreview).toBe(
      'Attachment: appointment-notes.txt',
    );
  });

  it('counts unread messages from the other party, and clears them once the thread is viewed', async () => {
    const conversation = await chat.getOrCreateByProvider(clientId, providerId);
    // Simulate the provider replying (no provider app in M1, so write it directly).
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        authorId: providerUserId,
        text: 'Yes, come by at 4.',
      },
    });

    const list = await chat.list(clientId);
    const row = list.find((c) => c.id === conversation.id);
    expect(row?.unreadCount).toBe(1);
    expect(row?.lastMessagePreview).toBe('Yes, come by at 4.');

    await chat.getMessages(conversation.id, clientId);
    const after = await chat.list(clientId);
    expect(after.find((c) => c.id === conversation.id)?.unreadCount).toBe(0);
  });

  it('lets the provider list, read, and reply in the same conversation', async () => {
    const conversation = await chat.getOrCreateByProvider(clientId, providerId);
    await chat.sendMessage(conversation.id, clientId, { text: 'Provider-side test' });

    const providerInbox = await chat.list(providerUserId);
    const providerRow = providerInbox.find((row) => row.id === conversation.id);
    expect(providerRow?.counterpartyName).toBe('Chat Client');
    expect(providerRow?.unreadCount).toBeGreaterThan(0);

    const providerMessages = await chat.getMessages(conversation.id, providerUserId);
    expect(providerMessages.some((message) => message.text === 'Provider-side test')).toBe(true);
    const clientAfterRead = await chat.getMessages(conversation.id, clientId);
    expect(clientAfterRead.find((message) => message.text === 'Provider-side test')?.read).toBe(
      true,
    );
    expect(
      (await chat.list(providerUserId)).find((row) => row.id === conversation.id)?.unreadCount,
    ).toBe(0);

    const reply = await chat.sendMessage(conversation.id, providerUserId, {
      text: 'Provider reply',
    });
    expect(reply.mine).toBe(true);
    const clientMessages = await chat.getMessages(conversation.id, clientId);
    expect(clientMessages.some((message) => message.text === 'Provider reply')).toBe(true);
  });

  it('opens the same order conversation for its buyer and seller, but nobody else', async () => {
    const order = await prisma.order.create({
      data: {
        reference: `CHAT-ORDER-${String(Date.now())}`,
        buyerId: clientId,
        providerId,
        paymentMethod: 'cash',
        totalUsdCents: 500,
      },
    });
    try {
      const buyerThread = await chat.getOrCreateByOrder(order.id, clientId);
      expect(buyerThread.counterpartyName).toBe('Chat Provider');

      const sellerThread = await chat.getOrCreateByOrder(order.id, providerUserId);
      expect(sellerThread.id).toBe(buyerThread.id);
      expect(sellerThread.counterpartyName).toBe('Chat Client');

      await expect(chat.getOrCreateByOrder(order.id, otherClientId)).rejects.toThrow();
    } finally {
      await prisma.order.delete({ where: { id: order.id } });
    }
  });
});

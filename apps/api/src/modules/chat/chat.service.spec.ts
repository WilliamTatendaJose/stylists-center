import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { ChatService } from './chat.service';
import { SocketEmitterService } from '../realtime/socket-emitter.service';
import { PrismaService } from '../prisma/prisma.service';
import type { Env } from '../../config/env';

/** Against real Postgres (sc_test) — no Testcontainers daemon in this sandbox. */
const TEST_DATABASE_URL = 'postgresql://sc:sc@localhost:5433/sc_test';
const BASE_ENV: Env = {
  NODE_ENV: 'test',
  PORT: 4000,
  DATABASE_URL: TEST_DATABASE_URL,
  REDIS_URL: 'redis://localhost:6380',
  JWT_ACCESS_SECRET: 'test-access-secret-at-least-32-characters-long',
  JWT_REFRESH_PEPPER: 'test-refresh-pepper-at-least-32-characters-long',
  AUTH_DEV_OTP: '000000',
  PLATFORM_FEE_BPS: 500,
  COIN_USD_CENTS: 50,
  CASH_OUT_MIN_USD_CENTS: 500,
  OSRM_BASE_URL: 'https://router.project-osrm.org',
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
    chat = new ChatService(prisma, socketEmitter);
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
});

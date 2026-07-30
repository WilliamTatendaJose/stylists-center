import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { ConversationDto, MessageDto, SendMessageInput } from '@sc/shared';
import { PrismaService } from '../prisma/prisma.service';
import { SocketEmitterService } from '../realtime/socket-emitter.service';
import { toConversationDto, toMessageDto } from './mappers';

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly socketEmitter: SocketEmitterService,
  ) {}

  async list(clientId: string): Promise<ConversationDto[]> {
    const conversations = await this.prisma.conversation.findMany({
      where: { clientId },
      include: {
        providerUser: { include: { providerProfile: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { lastMessageAt: 'desc' },
    });

    return Promise.all(
      conversations.map(async (c) => {
        const profile = c.providerUser.providerProfile;
        if (!profile) {
          throw new Error(`Conversation ${c.id} has no provider profile for its counterparty`);
        }
        const unreadCount = await this.prisma.message.count({
          where: { conversationId: c.id, authorId: { not: clientId }, createdAt: { gt: c.clientLastReadAt } },
        });
        return toConversationDto(c, profile, c.messages[0]?.text ?? '', unreadCount);
      }),
    );
  }

  /** Finds-or-creates the 1:1 thread with a provider — the only entry point a client needs, since it never has to track conversation ids itself. */
  async getOrCreateByProvider(clientId: string, providerId: string): Promise<ConversationDto> {
    const provider = await this.prisma.providerProfile.findUnique({ where: { id: providerId } });
    if (!provider) throw new NotFoundException('Provider not found');

    const conversation = await this.prisma.conversation.upsert({
      where: { clientId_providerUserId: { clientId, providerUserId: provider.userId } },
      update: {},
      create: { clientId, providerUserId: provider.userId },
    });

    const lastMessage = await this.prisma.message.findFirst({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'desc' },
    });
    const unreadCount = await this.prisma.message.count({
      where: {
        conversationId: conversation.id,
        authorId: { not: clientId },
        createdAt: { gt: conversation.clientLastReadAt },
      },
    });

    return toConversationDto(conversation, provider, lastMessage?.text ?? '', unreadCount);
  }

  /** Viewing the thread is what marks it read — plan §9's endpoint list has no separate "mark read" call. */
  async getMessages(conversationId: string, clientId: string): Promise<MessageDto[]> {
    const conversation = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conversation) throw new NotFoundException('Conversation not found');
    if (conversation.clientId !== clientId) throw new ForbiddenException();

    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { clientLastReadAt: new Date() },
    });

    return messages.map((m) => toMessageDto(m, clientId));
  }

  async sendMessage(conversationId: string, clientId: string, input: SendMessageInput): Promise<MessageDto> {
    const conversation = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conversation) throw new NotFoundException('Conversation not found');
    if (conversation.clientId !== clientId) throw new ForbiddenException();

    const [message] = await this.prisma.$transaction([
      this.prisma.message.create({ data: { conversationId, authorId: clientId, text: input.text } }),
      this.prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } }),
    ]);

    const dto = toMessageDto(message, clientId);
    // `mine` is viewer-relative: the conversation room only ever holds this
    // same client's other devices (multi-device sync), while the provider's
    // own `user:{id}` room needs the flag flipped for their eventual app.
    this.socketEmitter.emitToConversation(conversationId, 'message.created', dto);
    this.socketEmitter.emitToUser(conversation.providerUserId, 'message.created', { ...dto, mine: false });

    return dto;
  }
}

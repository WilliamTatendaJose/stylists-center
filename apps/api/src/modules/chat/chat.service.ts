import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  deriveInitials,
  deriveTint,
  type ConversationDto,
  type MessageDto,
  type SendMessageInput,
} from '@sc/shared';
import { PrismaService } from '../prisma/prisma.service';
import { SocketEmitterService } from '../realtime/socket-emitter.service';
import { toConversationDto, toMessageDto } from './mappers';

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly socketEmitter: SocketEmitterService,
  ) {}

  async list(viewerId: string): Promise<ConversationDto[]> {
    const conversations = await this.prisma.conversation.findMany({
      where: { OR: [{ clientId: viewerId }, { providerUserId: viewerId }] },
      include: {
        client: true,
        providerUser: { include: { providerProfile: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { lastMessageAt: 'desc' },
    });

    return Promise.all(
      conversations.map(async (c) => {
        const viewingAsClient = c.clientId === viewerId;
        const profile = c.providerUser.providerProfile;
        const counterparty = viewingAsClient
          ? profile
          : {
              displayName: c.client.displayName,
              tint: deriveTint(c.client.displayName),
              initials: deriveInitials(c.client.displayName),
            };
        if (!counterparty) throw new Error(`Conversation ${c.id} has no provider profile`);
        const lastReadAt = viewingAsClient ? c.clientLastReadAt : c.providerLastReadAt;
        const unreadCount = await this.prisma.message.count({
          where: {
            conversationId: c.id,
            authorId: { not: viewerId },
            createdAt: { gt: lastReadAt },
          },
        });
        return toConversationDto(c, counterparty, c.messages[0]?.text ?? '', unreadCount);
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
  async getMessages(conversationId: string, viewerId: string): Promise<MessageDto[]> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    this.assertParticipant(conversation, viewerId);

    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data:
        conversation.clientId === viewerId
          ? { clientLastReadAt: new Date() }
          : { providerLastReadAt: new Date() },
    });

    return messages.map((m) => toMessageDto(m, viewerId));
  }

  async sendMessage(
    conversationId: string,
    viewerId: string,
    input: SendMessageInput,
  ): Promise<MessageDto> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    this.assertParticipant(conversation, viewerId);

    const [message] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: { conversationId, authorId: viewerId, text: input.text },
      }),
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date() },
      }),
    ]);

    const dto = toMessageDto(message, viewerId);
    const counterpartyId =
      conversation.clientId === viewerId ? conversation.providerUserId : conversation.clientId;
    this.socketEmitter.emitToConversation(conversationId, 'message.created', dto);
    this.socketEmitter.emitToUser(counterpartyId, 'message.created', {
      ...dto,
      mine: false,
    });

    return dto;
  }

  private assertParticipant(
    conversation: { clientId: string; providerUserId: string },
    viewerId: string,
  ): void {
    if (conversation.clientId !== viewerId && conversation.providerUserId !== viewerId) {
      throw new ForbiddenException();
    }
  }
}

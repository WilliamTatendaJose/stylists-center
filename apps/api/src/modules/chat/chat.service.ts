import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  deriveInitials,
  deriveTint,
  type ConversationDto,
  type MessageDto,
  type SendMessageInput,
} from '@sc/shared';
import { PrismaService } from '../prisma/prisma.service';
import { SocketEmitterService } from '../realtime/socket-emitter.service';
import { PushService } from '../notifications/push.service';
import { toConversationDto, toMessageDto } from './mappers';
import {
  AttachmentStorageService,
  type UploadedAttachmentFile,
} from './attachment-storage.service';

function messagePreview(
  message: { text: string; attachments: { name: string }[] } | null | undefined,
) {
  if (!message) return '';
  const text = message.text.trim();
  if (text) return text;
  const attachment = message.attachments[0];
  return attachment ? `Attachment: ${attachment.name}` : '';
}

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly socketEmitter: SocketEmitterService,
    private readonly attachments: AttachmentStorageService,
    private readonly push: PushService,
  ) {}

  async list(viewerId: string): Promise<ConversationDto[]> {
    const conversations = await this.prisma.conversation.findMany({
      where: { OR: [{ clientId: viewerId }, { providerUserId: viewerId }] },
      include: {
        client: true,
        providerUser: { include: { providerProfile: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1, include: { attachments: true } },
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
              avatarImageUrl: c.client.avatarImageUrl,
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
        return toConversationDto(c, counterparty, messagePreview(c.messages[0]), unreadCount, {
          viewerId,
          lastMessageAuthorId: c.messages[0]?.authorId,
          counterpartyProviderId: viewingAsClient ? profile?.id : undefined,
        });
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
      include: { attachments: true },
    });
    const unreadCount = await this.prisma.message.count({
      where: {
        conversationId: conversation.id,
        authorId: { not: clientId },
        createdAt: { gt: conversation.clientLastReadAt },
      },
    });

    return toConversationDto(conversation, provider, messagePreview(lastMessage), unreadCount, {
      viewerId: clientId,
      lastMessageAuthorId: lastMessage?.authorId,
      counterpartyProviderId: provider.id,
    });
  }

  /**
   * Opens the buyer/seller thread from an order for either participant.
   * Order ownership is the authorization boundary, so a seller never needs a
   * buyer user id exposed in a mobile DTO and a stranger cannot guess one.
   */
  async getOrCreateByOrder(orderId: string, viewerId: string): Promise<ConversationDto> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { buyer: true, provider: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (viewerId !== order.buyerId && viewerId !== order.provider.userId) {
      throw new ForbiddenException();
    }

    const conversation = await this.prisma.conversation.upsert({
      where: {
        clientId_providerUserId: {
          clientId: order.buyerId,
          providerUserId: order.provider.userId,
        },
      },
      update: {},
      create: { clientId: order.buyerId, providerUserId: order.provider.userId },
    });
    const lastMessage = await this.prisma.message.findFirst({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'desc' },
      include: { attachments: true },
    });
    const viewingAsBuyer = viewerId === order.buyerId;
    const lastReadAt = viewingAsBuyer
      ? conversation.clientLastReadAt
      : conversation.providerLastReadAt;
    const unreadCount = await this.prisma.message.count({
      where: {
        conversationId: conversation.id,
        authorId: { not: viewerId },
        createdAt: { gt: lastReadAt },
      },
    });
    const counterparty = viewingAsBuyer
      ? order.provider
      : {
          displayName: order.buyer.displayName,
          tint: deriveTint(order.buyer.displayName),
          initials: deriveInitials(order.buyer.displayName),
          avatarImageUrl: order.buyer.avatarImageUrl,
        };
    return toConversationDto(conversation, counterparty, messagePreview(lastMessage), unreadCount, {
      viewerId,
      lastMessageAuthorId: lastMessage?.authorId,
      counterpartyProviderId: viewingAsBuyer ? order.provider.id : undefined,
    });
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
      include: { attachments: true },
    });

    const viewerLastReadAt =
      conversation.clientId === viewerId
        ? conversation.clientLastReadAt
        : conversation.providerLastReadAt;
    const readNewMessages = messages.some(
      (message) => message.authorId !== viewerId && message.createdAt > viewerLastReadAt,
    );

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data:
        conversation.clientId === viewerId
          ? { clientLastReadAt: new Date() }
          : { providerLastReadAt: new Date() },
    });

    const counterpartyId =
      conversation.clientId === viewerId ? conversation.providerUserId : conversation.clientId;
    if (readNewMessages) {
      this.socketEmitter.emitToUser(counterpartyId, 'conversation.read', {
        conversationId,
        readByUserId: viewerId,
      });
    }

    const counterpartyLastReadAt =
      conversation.clientId === viewerId
        ? conversation.providerLastReadAt
        : conversation.clientLastReadAt;
    return messages.map((m) => toMessageDto(m, viewerId, counterpartyLastReadAt));
  }

  async sendMessage(
    conversationId: string,
    viewerId: string,
    input: SendMessageInput,
    files: UploadedAttachmentFile[] = [],
  ): Promise<MessageDto> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    this.assertParticipant(conversation, viewerId);

    const text = input.text.trim();
    if (!text && files.length === 0) {
      throw new BadRequestException('Write a message or attach a file');
    }
    const storedAttachments = await this.attachments.saveMany(files);

    const message = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.message.create({
        data: {
          conversationId,
          authorId: viewerId,
          text,
          attachments: { create: storedAttachments },
        },
        include: { attachments: true },
      });
      await transaction.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date() },
      });
      return created;
    });

    const counterpartyLastReadAt =
      conversation.clientId === viewerId
        ? conversation.providerLastReadAt
        : conversation.clientLastReadAt;
    const dto = toMessageDto(message, viewerId, counterpartyLastReadAt);
    const counterpartyId =
      conversation.clientId === viewerId ? conversation.providerUserId : conversation.clientId;
    this.socketEmitter.emitToConversation(conversationId, 'message.created', dto);
    this.socketEmitter.emitToUser(counterpartyId, 'message.created', {
      ...dto,
      mine: false,
    });

    // Only the recipient, never the sender. `data.conversationId` is what lets
    // tapping the notification open this thread rather than the app's home.
    const sender = await this.prisma.user.findUnique({
      where: { id: viewerId },
      select: { displayName: true },
    });
    void this.push.sendToUser(counterpartyId, {
      title: sender?.displayName ?? 'New message',
      // An attachment-only message has no text, and a notification reading
      // "" tells the recipient nothing about whether it is worth opening.
      body: dto.text.trim() ? dto.text : 'Sent an attachment',
      data: { type: 'message.created', conversationId },
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

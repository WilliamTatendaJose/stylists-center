import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CHAT_MESSAGES_DEFAULT_LIMIT,
  deriveInitials,
  deriveTint,
  type ChatSafetyDto,
  type ConversationDto,
  type MessageDto,
  type MessagesQuery,
  type ReportConversationInput,
  type SendMessageInput,
} from '@sc/shared';
import { Prisma } from '../../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { SocketEmitterService } from '../realtime/socket-emitter.service';
import { PushService } from '../notifications/push.service';
import { toConversationDto, toMessageDto } from './mappers';
import {
  AttachmentStorageService,
  type UploadedAttachmentFile,
} from './attachment-storage.service';

const INBOX_LIMIT = 100;

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
      // Only what toConversationDto / the counterparty mapping reads.
      select: {
        id: true,
        clientId: true,
        lastMessageAt: true,
        client: { select: { displayName: true, avatarImageUrl: true } },
        providerUser: {
          select: {
            providerProfile: {
              select: {
                id: true,
                displayName: true,
                tint: true,
                initials: true,
                profileImageUrl: true,
              },
            },
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { authorId: true, text: true, attachments: { select: { name: true }, take: 1 } },
        },
      },
      orderBy: { lastMessageAt: 'desc' },
      // An inbox never needs every thread ever opened; the 100 most recently active is plenty.
      take: INBOX_LIMIT,
    });

    const unreadByConversation = await this.unreadCounts(
      viewerId,
      conversations.map((c) => c.id),
    );

    return conversations.map((c) => {
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
      return toConversationDto(
        c,
        counterparty,
        messagePreview(c.messages[0]),
        unreadByConversation.get(c.id) ?? 0,
        {
          viewerId,
          lastMessageAuthorId: c.messages[0]?.authorId,
          counterpartyProviderId: viewingAsClient ? profile?.id : undefined,
        },
      );
    });
  }

  /**
   * Unread counts for many conversations in one round trip: messages by the
   * other participant newer than the viewer's own last-read timestamp. Which
   * timestamp that is depends on the viewer's side of each conversation, so it
   * is chosen per row (client side wins a self-conversation, as before).
   * Conversations with nothing unread are simply absent from the result.
   */
  private async unreadCounts(viewerId: string, conversationIds: string[]) {
    const counts = new Map<string, number>();
    if (conversationIds.length === 0) return counts;
    const rows = await this.prisma.$queryRaw<{ conversationId: string; unread: number }[]>`
      SELECT m."conversationId" AS "conversationId", COUNT(*)::int AS "unread"
      FROM "Message" m
      JOIN "Conversation" c ON c."id" = m."conversationId"
      WHERE m."conversationId" IN (${Prisma.join(conversationIds)})
        AND m."authorId" <> ${viewerId}
        AND m."createdAt" > CASE
          WHEN c."clientId" = ${viewerId} THEN c."clientLastReadAt"
          ELSE c."providerLastReadAt"
        END
      GROUP BY m."conversationId"
    `;
    for (const row of rows) counts.set(row.conversationId, row.unread);
    return counts;
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

  /**
   * Viewing the thread is what marks it read — plan §9's endpoint list has no
   * separate "mark read" call. Returns one page, ascending: the latest `limit`
   * messages, or the `limit` messages immediately older than the `before` one.
   */
  async getMessages(
    conversationId: string,
    viewerId: string,
    query: Pick<MessagesQuery, 'limit'> & { before?: string | undefined } = {
      limit: CHAT_MESSAGES_DEFAULT_LIMIT,
    },
  ): Promise<MessageDto[]> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    this.assertParticipant(conversation, viewerId);

    const { limit, before } = query;
    const viewerLastReadAt =
      conversation.clientId === viewerId
        ? conversation.clientLastReadAt
        : conversation.providerLastReadAt;

    const [newestFirst, unreadMessage] = await Promise.all([
      this.prisma.message.findMany({
        where: { conversationId },
        // `id` breaks createdAt ties so the keyset cursor below is stable.
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit,
        // `skip: 1` steps over the cursor row itself. `where` still scopes the
        // result to this thread, so a foreign cursor id leaks nothing.
        ...(before ? { cursor: { id: before }, skip: 1 } : {}),
        include: { attachments: true },
      }),
      // Asked of the database rather than inferred from the page: the page
      // may be all the viewer's own messages while an older unread one exists.
      before
        ? null
        : this.prisma.message.findFirst({
            where: {
              conversationId,
              authorId: { not: viewerId },
              createdAt: { gt: viewerLastReadAt },
            },
            select: { id: true },
          }),
    ]);
    const messages = newestFirst.reverse();
    // Paging back into history is not "opening the thread": only the initial
    // (latest) page marks it read and notifies the counterparty.
    const readNewMessages = unreadMessage !== null;

    if (!before) {
      await this.prisma.conversation.update({
        where: { id: conversationId },
        data:
          conversation.clientId === viewerId
            ? { clientLastReadAt: new Date() }
            : { providerLastReadAt: new Date() },
      });
    }

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
    await this.assertNotBlocked(viewerId, this.counterpartyOf(conversation, viewerId));

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

  /** Whether either person in the chat has blocked the other. */
  async safety(conversationId: string, viewerId: string): Promise<ChatSafetyDto> {
    const conversation = await this.participantConversation(conversationId, viewerId);
    const other = this.counterpartyOf(conversation, viewerId);
    const blocks = await this.prisma.userBlock.findMany({
      where: {
        OR: [
          { blockerId: viewerId, blockedId: other },
          { blockerId: other, blockedId: viewerId },
        ],
      },
      select: { blockerId: true },
    });
    return {
      blockedByMe: blocks.some((b) => b.blockerId === viewerId),
      blockedMe: blocks.some((b) => b.blockerId === other),
    };
  }

  /** Blocks the other person: no more messages either way until unblocked. */
  async block(conversationId: string, viewerId: string): Promise<ChatSafetyDto> {
    const conversation = await this.participantConversation(conversationId, viewerId);
    const other = this.counterpartyOf(conversation, viewerId);
    await this.prisma.userBlock.upsert({
      where: { blockerId_blockedId: { blockerId: viewerId, blockedId: other } },
      update: {},
      create: { blockerId: viewerId, blockedId: other },
    });
    return this.safety(conversationId, viewerId);
  }

  async unblock(conversationId: string, viewerId: string): Promise<ChatSafetyDto> {
    const conversation = await this.participantConversation(conversationId, viewerId);
    const other = this.counterpartyOf(conversation, viewerId);
    await this.prisma.userBlock.deleteMany({ where: { blockerId: viewerId, blockedId: other } });
    return this.safety(conversationId, viewerId);
  }

  /** Reports the other person in the chat to staff (the console's reports queue). */
  async report(
    conversationId: string,
    viewerId: string,
    input: ReportConversationInput,
  ): Promise<void> {
    const conversation = await this.participantConversation(conversationId, viewerId);
    await this.prisma.report.create({
      data: {
        reporterId: viewerId,
        reportedId: this.counterpartyOf(conversation, viewerId),
        reason: input.reason,
      },
    });
  }

  private async participantConversation(conversationId: string, viewerId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    this.assertParticipant(conversation, viewerId);
    return conversation;
  }

  private counterpartyOf(
    conversation: { clientId: string; providerUserId: string },
    viewerId: string,
  ): string {
    return conversation.clientId === viewerId ? conversation.providerUserId : conversation.clientId;
  }

  private async assertNotBlocked(viewerId: string, otherId: string): Promise<void> {
    const block = await this.prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: viewerId, blockedId: otherId },
          { blockerId: otherId, blockedId: viewerId },
        ],
      },
    });
    if (block) {
      throw new ForbiddenException(
        block.blockerId === viewerId
          ? 'You blocked this person. Unblock them to send a message.'
          : "You can't send messages in this chat.",
      );
    }
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

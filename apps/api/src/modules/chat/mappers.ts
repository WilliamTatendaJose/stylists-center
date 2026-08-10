import type { ConversationDto, MessageDto } from '@sc/shared';
import type { Conversation, Message } from '../../generated/prisma';

export function toMessageDto(message: Message, viewerId: string): MessageDto {
  return {
    id: message.id,
    conversationId: message.conversationId,
    authorId: message.authorId,
    mine: message.authorId === viewerId,
    text: message.text,
    createdAt: message.createdAt.toISOString(),
  };
}

interface ProviderIdentity {
  displayName: string;
  tint: string;
  initials: string;
}

export function toConversationDto(
  conversation: Conversation,
  counterparty: ProviderIdentity,
  lastMessagePreview: string,
  unreadCount: number,
): ConversationDto {
  return {
    id: conversation.id,
    counterpartyName: counterparty.displayName,
    tint: counterparty.tint,
    initials: counterparty.initials,
    lastMessagePreview,
    lastMessageAt: conversation.lastMessageAt.toISOString(),
    unreadCount,
  };
}

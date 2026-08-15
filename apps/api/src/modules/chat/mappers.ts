import type { ConversationDto, MessageDto } from '@sc/shared';
import type { Conversation, Message, MessageAttachment } from '../../generated/prisma';

export function toMessageDto(
  message: Message & { attachments: MessageAttachment[] },
  viewerId: string,
  counterpartyLastReadAt: Date,
): MessageDto {
  return {
    id: message.id,
    conversationId: message.conversationId,
    authorId: message.authorId,
    mine: message.authorId === viewerId,
    text: message.text,
    read: message.authorId !== viewerId || message.createdAt <= counterpartyLastReadAt,
    attachments: message.attachments.map((attachment) => ({
      id: attachment.id,
      url: attachment.url,
      name: attachment.name,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
    })),
    createdAt: message.createdAt.toISOString(),
  };
}

interface ProviderIdentity {
  displayName: string;
  tint: string;
  initials: string;
  profileImageUrl?: string | null;
  avatarImageUrl?: string | null;
}

export function toConversationDto(
  conversation: Conversation,
  counterparty: ProviderIdentity,
  lastMessagePreview: string,
  unreadCount: number,
): ConversationDto {
  const imageUrl = counterparty.avatarImageUrl ?? counterparty.profileImageUrl;
  return {
    id: conversation.id,
    counterpartyName: counterparty.displayName,
    tint: counterparty.tint,
    initials: counterparty.initials,
    ...(imageUrl ? { imageUrl } : {}),
    lastMessagePreview,
    lastMessageAt: conversation.lastMessageAt.toISOString(),
    unreadCount,
  };
}

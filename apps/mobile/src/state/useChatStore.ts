import { create } from 'zustand';
import type { ConversationDto, MessageDto } from '@sc/shared';
import { CONVERSATIONS, MESSAGES } from '../fixtures/index.js';

/** Same rationale as useBookingsStore: local-only mutable mock state until Phase 3's chat socket lands. */
export interface ChatState {
  conversations: ConversationDto[];
  messagesByConversation: Record<string, MessageDto[]>;
  sendMessage: (conversationId: string, text: string) => void;
}

let nextId = 1000;

export const useChatStore = create<ChatState>((set) => ({
  conversations: CONVERSATIONS,
  messagesByConversation: MESSAGES,
  sendMessage: (conversationId, text) =>
    set((s) => {
      const message: MessageDto = {
        id: `m-local-${String(nextId++)}`,
        conversationId,
        authorId: 'me',
        mine: true,
        text,
        createdAt: new Date().toISOString(),
      };
      const existing = s.messagesByConversation[conversationId] ?? [];
      return {
        messagesByConversation: {
          ...s.messagesByConversation,
          [conversationId]: [...existing, message],
        },
        conversations: s.conversations.map((c) =>
          c.id === conversationId
            ? { ...c, lastMessagePreview: text, lastMessageAt: message.createdAt }
            : c,
        ),
      };
    }),
}));

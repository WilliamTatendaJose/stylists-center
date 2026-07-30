import { create } from 'zustand';
import type { ConversationDto, MessageDto } from '@sc/shared';
import { CONVERSATIONS, MESSAGES } from '../fixtures/index.js';

/** Same rationale as useBookingsStore: local-only mutable mock state until Phase 3's chat socket lands. */
export interface ConversationSeed {
  counterpartyName: string;
  tint: string;
  initials: string;
}

export interface ChatState {
  conversations: ConversationDto[];
  messagesByConversation: Record<string, MessageDto[]>;
  sendMessage: (conversationId: string, text: string) => void;
  /** No-ops if a conversation with this id already exists — lets a provider's "Message" button always open a real thread, even one the fixtures never seeded. */
  ensureConversation: (id: string, seed: ConversationSeed) => void;
}

let nextId = 1000;

export const useChatStore = create<ChatState>((set) => ({
  conversations: CONVERSATIONS,
  messagesByConversation: MESSAGES,
  ensureConversation: (id, seed) =>
    set((s) => {
      if (s.conversations.some((c) => c.id === id)) return s;
      const conversation: ConversationDto = {
        id,
        counterpartyName: seed.counterpartyName,
        tint: seed.tint,
        initials: seed.initials,
        lastMessagePreview: '',
        lastMessageAt: new Date().toISOString(),
        unreadCount: 0,
      };
      return {
        conversations: [conversation, ...s.conversations],
        messagesByConversation: { ...s.messagesByConversation, [id]: s.messagesByConversation[id] ?? [] },
      };
    }),
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

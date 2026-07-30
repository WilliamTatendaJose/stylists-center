import type { ConversationDto, MessageDto } from '@sc/shared';
import { PROVIDER_IDS } from './providers.js';

const ME = 'me';

export const CONVERSATION_IDS = {
  tariro: 'conv-tariro',
} as const;

export const CONVERSATIONS: ConversationDto[] = [
  {
    id: CONVERSATION_IDS.tariro,
    counterpartyName: 'Tariro',
    tint: '#201e1d',
    initials: 'TM',
    lastMessagePreview: 'See you at 16:30 then!',
    lastMessageAt: new Date(Date.now() - 25 * 60_000).toISOString(),
    unreadCount: 1,
  },
];

export const MESSAGES: Record<string, MessageDto[]> = {
  [CONVERSATION_IDS.tariro]: [
    {
      id: 'm1',
      conversationId: CONVERSATION_IDS.tariro,
      authorId: ME,
      mine: true,
      text: 'Hi! Are you free for cornrows today around 4:30?',
      createdAt: new Date(Date.now() - 60 * 60_000).toISOString(),
    },
    {
      id: 'm2',
      conversationId: CONVERSATION_IDS.tariro,
      authorId: PROVIDER_IDS.tariro,
      mine: false,
      text: 'Yes, 16:30 works. Home visit or my place in Avondale?',
      createdAt: new Date(Date.now() - 55 * 60_000).toISOString(),
    },
    {
      id: 'm3',
      conversationId: CONVERSATION_IDS.tariro,
      authorId: ME,
      mine: true,
      text: "I'll come to you.",
      createdAt: new Date(Date.now() - 50 * 60_000).toISOString(),
    },
    {
      id: 'm4',
      conversationId: CONVERSATION_IDS.tariro,
      authorId: PROVIDER_IDS.tariro,
      mine: false,
      text: 'See you at 16:30 then!',
      createdAt: new Date(Date.now() - 25 * 60_000).toISOString(),
    },
  ],
};

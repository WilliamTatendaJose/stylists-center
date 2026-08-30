import { describe, expect, it } from 'vitest';
import type { Conversation } from '../../generated/prisma';
import { toConversationDto } from './mappers';

describe('chat conversation mapper', () => {
  it('exposes a provider profile destination and whether the last message is mine', () => {
    const viewerId = '00000000-0000-4000-8000-000000000001';
    const providerId = '00000000-0000-4000-8000-000000000002';
    const conversation = {
      id: '00000000-0000-4000-8000-000000000003',
      lastMessageAt: new Date('2026-08-30T12:00:00.000Z'),
    } as Conversation;

    expect(
      toConversationDto(
        conversation,
        {
          displayName: 'Stylist Profile',
          tint: '#222222',
          initials: 'SP',
          profileImageUrl: '/uploads/stylist.jpg',
        },
        'See you soon',
        0,
        {
          viewerId,
          lastMessageAuthorId: viewerId,
          counterpartyProviderId: providerId,
        },
      ),
    ).toMatchObject({
      counterpartyProviderId: providerId,
      lastMessageMine: true,
      imageUrl: '/uploads/stylist.jpg',
    });
  });
});

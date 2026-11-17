import { describe, expect, it } from 'vitest';
import type { Conversation } from '../../generated/prisma';
import { toConversationDto, toMessageDto } from './mappers';

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

describe('chat message mapper', () => {
  it('hands attachments out through the signing function (they are private uploads)', () => {
    const dto = toMessageDto(
      {
        id: '00000000-0000-4000-8000-000000000010',
        conversationId: '00000000-0000-4000-8000-000000000011',
        authorId: '00000000-0000-4000-8000-000000000012',
        text: '',
        createdAt: new Date('2026-08-30T12:00:00.000Z'),
        attachments: [
          {
            id: '00000000-0000-4000-8000-000000000013',
            messageId: '00000000-0000-4000-8000-000000000010',
            url: '/uploads/3a6f010d-1d13-4a06-a747-0ae1b4be35d0.pdf',
            name: 'invoice.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 10,
            createdAt: new Date('2026-08-30T12:00:00.000Z'),
          },
        ],
      },
      '00000000-0000-4000-8000-000000000012',
      new Date(0),
      (url) => `${url}?exp=1&sig=x`,
    );
    expect(dto.attachments[0]?.url).toBe(
      '/uploads/3a6f010d-1d13-4a06-a747-0ae1b4be35d0.pdf?exp=1&sig=x',
    );
  });
});

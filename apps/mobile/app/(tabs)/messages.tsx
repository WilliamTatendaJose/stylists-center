import { router } from 'expo-router';
import { formatBookingWhen } from '@sc/shared';
import { Screen, ScreenHeader, ListRow, Badge, EmptyPanel } from '@sc/ui';
import { useConversations } from '../../src/api/hooks/useChat.js';

/** Messages inbox (thread list; conversations open at /chat/[threadId]). */
export default function Messages() {
  const { data: conversations = [] } = useConversations();
  const sorted = [...conversations].sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));

  const openThread = (threadId: string) => {
    router.push({ pathname: '/chat/[threadId]', params: { threadId } });
  };

  return (
    <Screen hasTabBar header={<ScreenHeader title="Messages" showBack={false} />}>
      {sorted.length === 0 ? (
        <EmptyPanel body="No conversations yet — message a stylist from their profile to start one." />
      ) : (
        sorted.map((conversation) => (
          <ListRow
            key={conversation.id}
            avatar={{ initials: conversation.initials, tint: conversation.tint, size: 48 }}
            title={conversation.counterpartyName}
            meta={conversation.lastMessagePreview || 'Say hello…'}
            rightCaption={formatBookingWhen(conversation.lastMessageAt)}
            right={
              conversation.unreadCount > 0 ? (
                <Badge label={String(conversation.unreadCount)} tone="accent" />
              ) : null
            }
            onPress={() => {
              openThread(conversation.id);
            }}
          />
        ))
      )}
    </Screen>
  );
}

import { Screen, ScreenHeader, Text } from '@sc/ui';

/** Messages inbox (thread list; conversations open at /chat/[threadId]) — placeholder. */
export default function Messages() {
  return (
    <Screen hasTabBar header={<ScreenHeader title="Messages" showBack={false} />}>
      <Text variant="body" color="neutral700">
        No conversations yet.
      </Text>
    </Screen>
  );
}

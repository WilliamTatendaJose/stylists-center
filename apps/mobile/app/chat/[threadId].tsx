import { useLocalSearchParams } from 'expo-router';
import { Screen, ScreenHeader, Text } from '@sc/ui';
import { useBack } from '../../src/navigation/useBack.js';

/** Chat (handoff screen 10). Reachable from a provider profile, a booking row, Directions, or Trip. */
export default function Chat() {
  const { threadId } = useLocalSearchParams<{ threadId: string }>();
  const onBack = useBack('/(tabs)/messages');

  return (
    <Screen header={<ScreenHeader title="Chat" onBack={onBack} />}>
      <Text variant="body" color="neutral700">
        Thread {threadId}
      </Text>
    </Screen>
  );
}

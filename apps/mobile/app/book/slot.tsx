import { Screen, ScreenHeader, Text } from '@sc/ui';
import { useBack } from '../../src/navigation/useBack.js';

/** Choose a slot (handoff screen 6, Step 1/2). */
export default function ChooseSlot() {
  const onBack = useBack('/(tabs)');

  return (
    <Screen header={<ScreenHeader title="Choose a slot" onBack={onBack} />}>
      <Text variant="body" color="neutral700">
        Pick a service, date, and time.
      </Text>
    </Screen>
  );
}

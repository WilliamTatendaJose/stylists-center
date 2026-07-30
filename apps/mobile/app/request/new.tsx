import { Screen, ScreenHeader, Text } from '@sc/ui';
import { useBack } from '../../src/navigation/useBack.js';

/** New request (handoff screen 2). Service chips / budget / radius land in Phase 1. */
export default function NewRequest() {
  const onBack = useBack('/(tabs)');

  return (
    <Screen header={<ScreenHeader title="New request" onBack={onBack} />}>
      <Text variant="body" color="neutral700">
        Tell us what you need and your budget.
      </Text>
    </Screen>
  );
}

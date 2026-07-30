import { Screen, ScreenHeader, Text } from '@sc/ui';
import { useBack } from '../../src/navigation/useBack.js';

/** Directions (handoff screen 13) — map pane lands in Phase 2. */
export default function Directions() {
  const onBack = useBack('/(tabs)');

  return (
    <Screen scroll={false} header={<ScreenHeader title="Getting there" onBack={onBack} />}>
      <Text variant="body" color="neutral700">
        Route (Phase 2).
      </Text>
    </Screen>
  );
}

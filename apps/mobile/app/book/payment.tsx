import { Screen, ScreenHeader, Text } from '@sc/ui';
import { useBack } from '../../src/navigation/useBack.js';

/** Payment (handoff screen 7, Step 2/2). */
export default function Payment() {
  const onBack = useBack('/book/slot');

  return (
    <Screen header={<ScreenHeader title="Payment" onBack={onBack} />}>
      <Text variant="body" color="neutral700">
        EcoCash or cash.
      </Text>
    </Screen>
  );
}

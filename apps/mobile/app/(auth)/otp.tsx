import { Screen, ScreenHeader, Text } from '@sc/ui';
import { useBack } from '../../src/navigation/useBack.js';

export default function OtpEntry() {
  const onBack = useBack('/(auth)/phone');

  return (
    <Screen header={<ScreenHeader title="Verify" onBack={onBack} />}>
      <Text variant="body" color="neutral700">
        Enter the code we sent you.
      </Text>
    </Screen>
  );
}

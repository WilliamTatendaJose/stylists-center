import { useLocalSearchParams } from 'expo-router';
import { Screen, ScreenHeader, Text } from '@sc/ui';
import { useBack } from '../../src/navigation/useBack.js';

/**
 * Provider profile (handoff screen 5). Reachable from Home, Map search, and
 * an accepted smart-match offer — each of those call sites must pass an
 * explicit `back` param (see useBack), since a plain stack pop is only
 * correct for one of the three.
 */
export default function ProviderProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const onBack = useBack('/(tabs)');

  return (
    <Screen header={<ScreenHeader title="Provider" onBack={onBack} />}>
      <Text variant="body" color="neutral700">
        Provider {id}
      </Text>
    </Screen>
  );
}

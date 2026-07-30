import { useEffect } from 'react';
import { BackHandler } from 'react-native';
import { color } from '@sc/tokens';
import { Screen, ScreenHeader, Text } from '@sc/ui';
import { useBack } from '../../src/navigation/useBack.js';

/**
 * Smart match — searching (handoff screen 3, dark). RadarPulse/Countdown/
 * OfferCard (Tier 3) and the live server-authoritative match state land in
 * Phase 1/3. The one piece of navigation behaviour that belongs here from day
 * one: hardware back must trigger Cancel (and cancel the server-side match),
 * never a silent pop — enforced now so it can't be forgotten once the timer
 * logic lands.
 */
export default function Searching() {
  const cancel = useBack('/(tabs)');

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      cancel();
      return true;
    });
    return () => {
      sub.remove();
    };
  }, [cancel]);

  return (
    <Screen theme="dark" header={<ScreenHeader title="Attempt 1 of 3" showBack={false} onDark />}>
      <Text variant="countdown" color={color.onDark.text}>
        5:00
      </Text>
    </Screen>
  );
}

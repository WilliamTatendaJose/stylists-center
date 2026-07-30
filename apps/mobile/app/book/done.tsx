import { color } from '@sc/tokens';
import { Screen, Text } from '@sc/ui';

/** Booked (handoff screen 8, full accent). No header at all — the screen starts straight into content. */
export default function Booked() {
  return (
    <Screen theme="accent">
      <Text variant="hero" color={color.onAccent.text}>
        Booked.
      </Text>
    </Screen>
  );
}

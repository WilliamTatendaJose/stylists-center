import { Screen, ScreenHeader, Text } from '@sc/ui';

/** Bookings (handoff screen 9) — placeholder. Real rows/states in Phase 1. */
export default function Bookings() {
  return (
    <Screen hasTabBar header={<ScreenHeader title="Bookings" showBack={false} />}>
      <Text variant="body" color="neutral700">
        No bookings yet.
      </Text>
    </Screen>
  );
}

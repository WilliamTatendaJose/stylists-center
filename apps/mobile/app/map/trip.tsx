import { Screen, Text } from '@sc/ui';

/** Trip live (handoff screen 14) — animated position dot lands with the map wrapper in Phase 2. */
export default function Trip() {
  return (
    <Screen scroll={false}>
      <Text variant="body" color="neutral700">
        Live trip (Phase 2).
      </Text>
    </Screen>
  );
}

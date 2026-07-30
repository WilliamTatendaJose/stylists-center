import { Screen, Text } from '@sc/ui';

/**
 * Map search (handoff screen 12) — full-bleed map with floating overlay
 * controls (not a normal header row), so this uses `header={undefined}`.
 * The actual MapLibre wrapper (@sc/ui's ScMap) lands in Phase 2 of the build
 * order (plan §5/§9) — this is a route-tree placeholder only.
 */
export default function MapSearch() {
  return (
    <Screen scroll={false}>
      <Text variant="body" color="neutral700">
        Map (Phase 2).
      </Text>
    </Screen>
  );
}

import { Screen, ScreenHeader, Text } from '@sc/ui';

/**
 * Find (handoff screen 1) — placeholder. The tab-root screens have no back
 * chevron; ScreenHeader's `showBack=false` covers that. Real content
 * (search row, categories grid, "Available now" list, smart-match promo)
 * lands in Phase 1 of the build order, against @sc/shared fixtures.
 */
export default function Find() {
  return (
    <Screen hasTabBar header={<ScreenHeader title="Stylists Center" showBack={false} />}>
      <Text variant="h2">Book the hands{'\n'}you actually want.</Text>
    </Screen>
  );
}

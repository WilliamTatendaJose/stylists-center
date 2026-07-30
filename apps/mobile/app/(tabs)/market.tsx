import { Screen, ScreenHeader, Text } from '@sc/ui';

/** Marketplace (handoff screens 15-18) — a later milestone; M1 ships this as a stub. */
export default function Market() {
  return (
    <Screen hasTabBar header={<ScreenHeader title="Market" showBack={false} />}>
      <Text variant="body" color="neutral700">
        Coming soon.
      </Text>
    </Screen>
  );
}

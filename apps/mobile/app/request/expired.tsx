import { Screen, ScreenHeader, Text } from '@sc/ui';

/** Request expired (handoff screen 4) — no back chevron; the way out is TRY AGAIN or BROWSE STYLISTS INSTEAD. */
export default function Expired() {
  return (
    <Screen header={<ScreenHeader title="Request expired" showBack={false} />}>
      <Text variant="h2Small">Nobody was free.</Text>
    </Screen>
  );
}

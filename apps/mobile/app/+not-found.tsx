import { StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { space } from '@sc/tokens';
import { Screen, ScreenHeader, Text, Button } from '@sc/ui';

const styles = StyleSheet.create({
  body: { marginBottom: space.xl },
});

/**
 * Reached by a stale deep link or a route that no longer exists.
 *
 * It previously rendered one line of text and nothing else — no header, no
 * back affordance, no action. A user arriving here from a link had no way
 * into the app at all except to force-quit and relaunch.
 */
export default function NotFound() {
  return (
    <Screen header={<ScreenHeader title="Not found" showBack={false} />}>
      <Text variant="body" color="neutral700" style={styles.body}>
        That screen doesn&apos;t exist — the link may be old, or the page may have moved.
      </Text>
      <Button
        label="Go to Find"
        block
        onPress={() => {
          // `replace`, not `push`: a dead end should not stay in the stack
          // behind the user where back can return them to it.
          router.replace('/(tabs)');
        }}
      />
    </Screen>
  );
}

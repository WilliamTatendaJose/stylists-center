import { StyleSheet, View } from 'react-native';
import type { ErrorBoundaryProps } from 'expo-router';
import { color, space } from '@sc/tokens';
import { Text, Button } from '@sc/ui';

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: color.bg,
    justifyContent: 'center',
    paddingHorizontal: space.l,
    paddingVertical: space.xxl,
  },
  title: { marginBottom: space.s },
  body: { marginBottom: space.xl },
  detail: { marginTop: space.xl },
});

/**
 * Rendered by expo-router in place of a route segment whose render threw.
 *
 * Deliberately built from `View` + primitives rather than `Screen`: this
 * component runs *because* the tree below failed, so it must not itself
 * depend on anything that could be the thing that broke — `Screen` calls
 * `useSafeAreaInsets()`, which throws outside a SafeAreaProvider, and an
 * error boundary that crashes leaves the user with a bare white screen and
 * no way out.
 *
 * `retry()` re-mounts the failed segment, which is the right first move for
 * the realistic causes here (a transient render over half-loaded data)
 * without forcing the user to kill and relaunch the app.
 */
export function AppErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View style={styles.root}>
      <Text variant="h2" style={styles.title}>
        Something went wrong
      </Text>

      <Text variant="body" color="neutral700" style={styles.body}>
        This screen ran into a problem. Trying again usually fixes it — if it keeps happening,
        restart the app.
      </Text>

      <Button
        label="Try again"
        block
        size="lg"
        onPress={() => {
          void retry();
        }}
      />

      {/* The message is shown only in development: in a release build it is
          noise at best, and at worst leaks internals to the user. Production
          diagnostics belong in a crash reporter, not on screen. */}
      {__DEV__ ? (
        <Text variant="meta" color="neutral700" style={styles.detail}>
          {error.message}
        </Text>
      ) : null}
    </View>
  );
}

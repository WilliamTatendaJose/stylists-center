import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { usePathname, type ErrorBoundaryProps } from 'expo-router';
import { apiFetch } from '../api/client.js';
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
/** A short code the person can quote; the same code is in the server log. */
function referenceCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

/**
 * Tells the server what failed, so a crash in a release build (where the
 * message is hidden from the person) can be found in the API logs by its
 * reference code. Best effort: reporting must never break the error screen.
 */
function useReportCrash(error: Error, ref: string): void {
  // Rendered by expo-router inside the failed route, so the router context exists.
  const route = usePathname();
  useEffect(() => {
    void apiFetch<void>('/v1/client-errors', {
      method: 'POST',
      body: {
        ref,
        message: String(error.message || error.name || 'Unknown error').slice(0, 500),
        ...(error.stack ? { stack: error.stack.slice(0, 4000) } : {}),
        ...(route ? { route } : {}),
        ...(Constants.expoConfig?.version ? { appVersion: Constants.expoConfig.version } : {}),
        ...(Updates.updateId ? { updateId: Updates.updateId } : {}),
      },
    }).catch(() => undefined);
  }, [error, ref, route]);
}

export function AppErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  // One code per failure; "Try again" remounts this screen for a new one.
  const [ref] = useState(referenceCode);
  useReportCrash(error, ref);
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

      <Text variant="meta" color="neutral600" style={styles.detail}>
        Reference: {ref}
      </Text>

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

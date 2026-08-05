import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import {
  useFonts,
  Archivo_400Regular,
  Archivo_600SemiBold,
  Archivo_800ExtraBold,
} from '@expo-google-fonts/archivo';
import { PERSIST_OPTIONS, queryClient } from '../src/api/queryClient.js';
import { useSessionStore } from '../src/state/index.js';
import { downloadAvondaleAreaPack } from '../src/offline/downloadAreaPack.js';
import { useAuthGate } from '../src/auth/useAuthGate.js';
import { AppErrorBoundary } from '../src/errors/AppErrorBoundary.js';

// expo-router renders a route's exported `ErrorBoundary` when that segment
// throws. Exported from the root layout so it covers every screen.
export { AppErrorBoundary as ErrorBoundary };

const styles = StyleSheet.create({
  root: { flex: 1 },
});

/**
 * Root layout. GestureHandlerRootView must wrap everything for
 * react-native-gesture-handler to work at all; SafeAreaProvider is required
 * by every Screen's useSafeAreaInsets() call. PersistQueryClientProvider
 * makes the HTTP hooks in src/api/hooks available to every screen, and
 * restores the last-known-good server state from AsyncStorage on cold start
 * (plan §7) so a screen still shows something before the first real fetch
 * resolves.
 */
export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Archivo_400Regular,
    Archivo_600SemiBold,
    Archivo_800ExtraBold,
  });
  const hasDownloadedOfflinePack = useSessionStore((s) => s.hasDownloadedOfflinePack);
  const setHasDownloadedOfflinePack = useSessionStore((s) => s.setHasDownloadedOfflinePack);

  // Stands in for "on first login" (plan §5/§9 item 18) until auth exists —
  // downloads the client's home-area tile pack once so the map screens work
  // offline afterwards. Left false on failure so it retries next launch.
  useEffect(() => {
    if (hasDownloadedOfflinePack) return;
    downloadAvondaleAreaPack()
      .then(() => {
        setHasDownloadedOfflinePack(true);
      })
      .catch(() => {
        /* retried on next app launch */
      });
  }, [hasDownloadedOfflinePack, setHasDownloadedOfflinePack]);

  // A font that fails to load must not hold the app hostage: `fontsLoaded`
  // stays false forever in that case, and gating on it alone left the user
  // staring at a blank screen with no error and no recovery. Rendering
  // anyway degrades to the system typeface, which is strictly better than
  // an app that never starts.
  const fontsReady = fontsLoaded || !!fontError;

  // Providers mount unconditionally, not behind the fonts/auth gate: the gate
  // itself (useAuthGate -> useMe -> useQuery) needs a QueryClient from
  // PersistQueryClientProvider to read from. The previous version called
  // useAuthGate() here, in RootLayout's own body — outside the JSX these
  // providers wrap — so every launch crashed with "No QueryClient set,
  // use QueryClientProvider to set one" before a single screen rendered.
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <PersistQueryClientProvider client={queryClient} persistOptions={PERSIST_OPTIONS}>
          <AuthGatedNavigator fontsReady={fontsReady} />
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/** Rendered inside every provider above, so useAuthGate's useMe() call can actually find a QueryClient. */
function AuthGatedNavigator({ fontsReady }: { fontsReady: boolean }) {
  const isAuthHydrated = useAuthGate();
  if (!fontsReady || !isAuthHydrated) return null;
  return <Stack screenOptions={{ headerShown: false }} />;
}

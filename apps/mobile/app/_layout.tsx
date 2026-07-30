import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
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

const styles = StyleSheet.create({
  root: { flex: 1 },
});

/**
 * Root layout. GestureHandlerRootView must wrap everything for
 * react-native-gesture-handler (and by extension @gorhom/bottom-sheet, Tier 3)
 * to work at all; SafeAreaProvider is required by every Screen's
 * useSafeAreaInsets() call. PersistQueryClientProvider makes the HTTP hooks
 * in src/api/hooks available to every screen, and restores the last-known
 * -good server state from AsyncStorage on cold start (plan §7) so a screen
 * still shows something before the first real fetch resolves. BottomSheetModalProvider
 * is required by @sc/ui's Sheet (the role switcher, report-a-problem).
 */
export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Archivo_400Regular,
    Archivo_600SemiBold,
    Archivo_800ExtraBold,
  });
  const hasDownloadedOfflinePack = useSessionStore((s) => s.hasDownloadedOfflinePack);
  const setHasDownloadedOfflinePack = useSessionStore((s) => s.setHasDownloadedOfflinePack);
  const isAuthHydrated = useAuthGate();

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

  if (!fontsLoaded || !isAuthHydrated) return null;

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <PersistQueryClientProvider client={queryClient} persistOptions={PERSIST_OPTIONS}>
          <BottomSheetModalProvider>
            <Stack screenOptions={{ headerShown: false }} />
          </BottomSheetModalProvider>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

import { StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  useFonts,
  Archivo_400Regular,
  Archivo_600SemiBold,
  Archivo_800ExtraBold,
} from '@expo-google-fonts/archivo';

const styles = StyleSheet.create({
  root: { flex: 1 },
});

/**
 * Root layout. GestureHandlerRootView must wrap everything for
 * react-native-gesture-handler (and by extension @gorhom/bottom-sheet, Tier 3)
 * to work at all; SafeAreaProvider is required by every Screen's
 * useSafeAreaInsets() call.
 *
 * Replaced further when the full navigation shell (route groups,
 * FloatingTabBar) lands — this exists so Expo Router's entry point and the
 * font/provider stack are correct now that @sc/ui's Tier 0/1 components exist.
 */
export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Archivo_400Regular,
    Archivo_600SemiBold,
    Archivo_800ExtraBold,
  });

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

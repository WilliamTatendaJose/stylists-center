import type { ExpoConfig } from 'expo/config';

/**
 * app.config.ts instead of app.json: the MapLibre config plugin (§5 of the
 * plan) and future EAS build profiles need conditional logic that a static
 * JSON file can't express.
 */
const config: ExpoConfig = {
  name: 'Stylists Center',
  slug: 'stylists-center',
  scheme: 'stylistscenter',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  // No newArchEnabled flag: SDK 57 / RN 0.86 ship the New Architecture only,
  // so the config option was removed rather than defaulted.
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'zw.co.stylistscenter.app',
  },
  android: {
    package: 'zw.co.stylistscenter.app',
    adaptiveIcon: {
      backgroundColor: '#EC3013',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    // Live location is scoped to a single trip and terminates on check-in
    // (plan risk R8) — foreground-only, deliberately, so the app never
    // declares Play Store's background-location policy at all.
    permissions: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION'],
  },
  web: {
    favicon: './assets/favicon.png',
    bundler: 'metro',
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    [
      'expo-font',
      {
        fonts: [
          './node_modules/@expo-google-fonts/archivo/400Regular/Archivo_400Regular.ttf',
          './node_modules/@expo-google-fonts/archivo/600SemiBold/Archivo_600SemiBold.ttf',
          './node_modules/@expo-google-fonts/archivo/800ExtraBold/Archivo_800ExtraBold.ttf',
        ],
      },
    ],
    // MapLibre is native code (§5 of the plan) — this is what requires a
    // dev-client build instead of Expo Go from day one.
    '@maplibre/maplibre-react-native',
  ],
  extra: {
    router: {},
  },
  experiments: {
    typedRoutes: true,
  },
};

export default config;

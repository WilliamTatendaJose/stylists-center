import type { ExpoConfig } from 'expo/config';

/**
 * A release build has no Metro server, so src/api/client.ts cannot infer the
 * API host from `hostUri` and falls through to localhost — i.e. the phone
 * itself. That failure is invisible in every dev test and total in the store
 * build, so it is caught here, at build time, instead of shipping.
 */
const RELEASE_PROFILES = ['preview', 'production'];
if (
  RELEASE_PROFILES.includes(process.env.EAS_BUILD_PROFILE ?? '') &&
  !process.env.EXPO_PUBLIC_API_URL
) {
  throw new Error(
    `EXPO_PUBLIC_API_URL must be set for the "${process.env.EAS_BUILD_PROFILE ?? ''}" build profile — ` +
      'without it the app would try to reach the API on the device itself.',
  );
}

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
    // Play requires a monotonically increasing integer that is independent of
    // the user-facing `version`. Bump on every upload; Play rejects a reused
    // value outright, so this cannot be left implicit.
    versionCode: 1,
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
        // Resolved rather than written as './node_modules/...': .npmrc pins
        // node-linker=hoisted, so these live in the workspace root's
        // node_modules, not apps/mobile's, and a relative literal makes
        // `expo prebuild` fail with "Cannot find module".
        fonts: [
          require.resolve('@expo-google-fonts/archivo/400Regular/Archivo_400Regular.ttf'),
          require.resolve('@expo-google-fonts/archivo/600SemiBold/Archivo_600SemiBold.ttf'),
          require.resolve('@expo-google-fonts/archivo/800ExtraBold/Archivo_800ExtraBold.ttf'),
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

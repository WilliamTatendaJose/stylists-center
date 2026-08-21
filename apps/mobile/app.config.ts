import { existsSync } from 'node:fs';
import type { ExpoConfig } from 'expo/config';

/**
 * A release build has no Metro server, so src/api/client.ts cannot infer the
 * API host from `hostUri` and falls through to localhost — i.e. the phone
 * itself. That failure is invisible in every dev test and total in the store
 * build, so it is caught here, at build time, instead of shipping.
 */
const RELEASE_PROFILES = ['preview', 'production'];
const isReleaseProfile = RELEASE_PROFILES.includes(process.env.EAS_BUILD_PROFILE ?? '');

if (isReleaseProfile && !process.env.EXPO_PUBLIC_API_URL?.trim()) {
  throw new Error(
    `EXPO_PUBLIC_API_URL must be set for the "${process.env.EAS_BUILD_PROFILE ?? ''}" build profile — ` +
      'without it the app would try to reach the API on the device itself.',
  );
}

if (isReleaseProfile && !process.env.EXPO_PUBLIC_MAPTILER_KEY?.trim()) {
  throw new Error(
    `EXPO_PUBLIC_MAPTILER_KEY must be set for the "${process.env.EAS_BUILD_PROFILE ?? ''}" build profile - ` +
      'release builds must not fall back to the OpenStreetMap public tile server.',
  );
}

if (isReleaseProfile && !process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim()) {
  throw new Error(
    `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID must be set for the "${process.env.EAS_BUILD_PROFILE ?? ''}" build profile.`,
  );
}

/**
 * Android push needs google-services.json for Firebase to initialise on the
 * device; without it expo-notifications cannot mint a token at all, so the
 * server never learns where to send anything.
 *
 * The file is a credential, so it is gitignored and supplied per build: EAS
 * file environment variables expose the uploaded file's path in
 * GOOGLE_SERVICES_JSON, and a local checkout can just drop the file in place.
 *
 * Deliberately omitted rather than defaulted when neither exists. Pointing
 * `googleServicesFile` at a path that is not there fails the build outright,
 * which would break the working preview pipeline to fix a feature that is
 * merely absent — push stays silent until the credential is configured, and
 * everything else keeps shipping. See RAILWAY.md for the setup steps.
 */
const googleServicesFile = (() => {
  const fromEas = process.env.GOOGLE_SERVICES_JSON?.trim();
  if (fromEas && existsSync(fromEas)) return fromEas;
  return existsSync('./google-services.json') ? './google-services.json' : undefined;
})();

/**
 * app.config.ts instead of app.json: the MapLibre config plugin (§5 of the
 * plan) and future EAS build profiles need conditional logic that a static
 * JSON file can't express.
 */
const config: ExpoConfig = {
  name: 'Stylists Center',
  slug: 'style-center',
  scheme: 'stylistscenter',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  // Keep native surfaces (dialogs, inputs and the status/navigation bars) in
  // sync with the in-app appearance setting instead of forcing light mode.
  userInterfaceStyle: 'automatic',
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
    //
    // Bumping is manual on purpose. eas.json's production profile used to set
    // `autoIncrement: true`, which cannot work here: with
    // `appVersionSource: "local"` EAS increments by writing the value back into
    // the app config, and it refuses to write to a dynamic one — this project
    // has app.config.ts and no app.json, so eas-cli threw "autoIncrement option
    // is not supported when using app.config.js" before the build started.
    // Switching `appVersionSource` to "remote" would let EAS own the number
    // instead, which is the alternative if bumping this by hand ever gets missed.
    versionCode: 1,
    adaptiveIcon: {
      backgroundColor: '#EC3013',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    ...(googleServicesFile ? { googleServicesFile } : {}),
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
    '@react-native-google-signin/google-signin',
    'expo-secure-store',
    'expo-notifications',
    'expo-web-browser',
    [
      'expo-image-picker',
      {
        photosPermission: 'Allow Stylists Center to choose photos for your profile and shop items.',
      },
    ],
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
    eas: {
      projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? '563fa89a-e790-487f-8d78-0815ed9588c1',
    },
  },
  experiments: {
    typedRoutes: true,
  },
};

export default config;

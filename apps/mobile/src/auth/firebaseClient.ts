import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, initializeAuth, type Auth, type Persistence } from 'firebase/auth';
import * as firebaseAuthSdk from 'firebase/auth';

// Firebase's runtime selects its React Native export through Metro's
// `react-native` condition, but the umbrella package's TypeScript declaration
// currently exposes only the web condition. Keep the cast isolated here.
const getReactNativePersistence = (
  firebaseAuthSdk as typeof firebaseAuthSdk & {
    getReactNativePersistence: (storage: typeof AsyncStorage) => Persistence;
  }
).getReactNativePersistence;

const firebaseApp = getApps().length
  ? getApp()
  : initializeApp({
      apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? 'AIzaSyD9myTkJMXTWBhIbrt4hQUdtxfxqI7S0NE',
      authDomain:
        process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? 'style-center-5162a.firebaseapp.com',
      projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? 'style-center-5162a',
      appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? '1:742235961910:web:b6f042b9ed47afe4f5f697',
    });

function createAuth(): Auth {
  try {
    return initializeAuth(firebaseApp, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch {
    return getAuth(firebaseApp);
  }
}

export const firebaseAuth = createAuth();

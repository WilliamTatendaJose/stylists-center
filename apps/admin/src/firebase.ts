import type { Auth } from 'firebase/auth';

/**
 * Firebase web config for the project the mobile app signs users in with.
 * These values are public identifiers (they ship inside every app build and
 * are in apps/mobile/eas.json), not secrets: what protects the project is the
 * authorised-domains list in the Firebase console. The VITE_FIREBASE_*
 * build variables override them, e.g. to point a staging console elsewhere.
 */
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? 'AIzaSyD9myTkJMXTWBhIbrt4hQUdtxfxqI7S0NE',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? 'style-center-5162a.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? 'style-center-5162a',
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? '1:742235961910:web:b6f042b9ed47afe4f5f697',
};

let authPromise: Promise<Auth> | null = null;

/**
 * Firebase is only used for "forgot password", so it is loaded on demand:
 * the sign-in page and the rest of the console never download it.
 */
export function getFirebaseAuth(): Promise<Auth> {
  authPromise ??= (async () => {
    const [{ initializeApp, getApps }, { getAuth }] = await Promise.all([
      import('firebase/app'),
      import('firebase/auth'),
    ]);
    const app =
      getApps().find((candidate) => candidate.name === 'admin-console') ??
      initializeApp(firebaseConfig, 'admin-console');
    return getAuth(app);
  })();
  return authPromise;
}

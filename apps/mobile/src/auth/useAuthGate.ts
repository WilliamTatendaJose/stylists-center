import { useEffect } from 'react';
import { router, useSegments } from 'expo-router';
import { useAuthStore } from '../state/useAuthStore.js';

/**
 * Redirects between the (auth) group and the rest of the app based on
 * whether a session exists — the auth gate. Returns whether the secure-store
 * read has resolved yet, so the root layout can hold the splash screen until
 * it has (never flash the wrong stack for a frame).
 */
export function useAuthGate(): boolean {
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const accessToken = useAuthStore((s) => s.accessToken);
  const hydrate = useAuthStore((s) => s.hydrate);
  const segments = useSegments();

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!isHydrated) return;
    const inAuthGroup = segments[0] === '(auth)';

    if (!accessToken && !inAuthGroup) {
      router.replace('/(auth)/phone');
    } else if (accessToken && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [isHydrated, accessToken, segments]);

  return isHydrated;
}

import { useEffect } from 'react';
import { router, useSegments } from 'expo-router';
import { useAuthStore } from '../state/useAuthStore.js';
import { useMe } from '../api/hooks/useMe.js';

/**
 * Redirects between the (auth) group and the rest of the app based on
 * whether a session exists — the auth gate. Returns whether the secure-store
 * read has resolved yet, so the root layout can hold the splash screen until
 * it has (never flash the wrong stack for a frame).
 *
 * Also routes between the two sides of the marketplace. `activeRole` is the
 * server's answer, not a local preference, so signing in on a new device puts
 * a stylist straight into their own side of the app.
 */
export function useAuthGate(): boolean {
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const accessToken = useAuthStore((s) => s.accessToken);
  const hydrate = useAuthStore((s) => s.hydrate);
  const segments = useSegments();
  const { data: me } = useMe();

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!isHydrated) return;
    const inAuthGroup = segments[0] === '(auth)';

    if (!accessToken && !inAuthGroup) {
      router.replace('/(auth)/phone');
      return;
    }
    if (accessToken && inAuthGroup) {
      router.replace('/(tabs)');
      return;
    }

    // Role routing waits for /v1/me: guessing from a local default would
    // bounce a stylist through the client tabs on every cold start.
    if (!accessToken || !me) return;

    const inProviderGroup = segments[0] === '(provider)';
    const wantsProvider = me.activeRole === 'provider' && me.hasProviderProfile;

    if (wantsProvider && !inProviderGroup) {
      router.replace('/(provider)/jobs');
    } else if (!wantsProvider && inProviderGroup) {
      // Covers switching back to client AND the edge case of an account in
      // 'provider' role whose stylist page has gone — without the
      // hasProviderProfile check that account would be stranded on a group
      // whose every request 403s.
      router.replace('/(tabs)');
    }
  }, [isHydrated, accessToken, segments, me]);

  return isHydrated;
}

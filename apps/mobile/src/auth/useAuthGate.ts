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
 * Also routes between the two sides of the marketplace, and — before either
 * side — forces a stop at /complete-profile for any account still carrying
 * its sign-up placeholder name (see auth.service.ts / isProfileComplete).
 * `activeRole` is the server's answer, not a local preference, so signing in
 * on a new device puts a stylist straight into their own side of the app.
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

    // Role and profile-completion routing both wait for /v1/me: guessing
    // from a local default would bounce a stylist through the client tabs
    // (or past the name prompt) on every cold start.
    if (!accessToken || !me) return;

    // A real name comes before either side of the app — a client mid
    // smart-match and a stylist mid job list both still need one.
    if (!me.profileComplete) {
      if (segments[0] !== 'complete-profile') router.replace('/complete-profile');
      return;
    }

    const inProviderGroup = segments[0] === '(provider)';
    const wantsProvider = me.activeRole === 'provider' && me.hasProviderProfile;
    const onCompleteProfile = segments[0] === 'complete-profile';

    // Three cases collapse to the same fix: sitting on the now-finished name
    // prompt, or on the wrong side of the client/provider split either way.
    if (onCompleteProfile || (wantsProvider && !inProviderGroup) || (!wantsProvider && inProviderGroup)) {
      router.replace(wantsProvider ? '/(provider)/jobs' : '/(tabs)');
    }
  }, [isHydrated, accessToken, segments, me]);

  return isHydrated;
}

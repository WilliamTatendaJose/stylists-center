import { useEffect } from 'react';
import { router, useSegments } from 'expo-router';
import { useAuthStore } from '../state/useAuthStore.js';
import { useSessionStore } from '../state/useSessionStore.js';
import { usePendingProviderStore } from '../state/usePendingProviderStore.js';
import { useSignupIntentStore } from '../state/useSignupIntentStore.js';
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
  const isSessionHydrated = useSessionStore((s) => s.isHydrated);
  const hasSeenOnboarding = useSessionStore((s) => s.hasSeenOnboarding);
  const accessToken = useAuthStore((s) => s.accessToken);
  const hydrate = useAuthStore((s) => s.hydrate);
  const segments = useSegments();
  const { data: me } = useMe();
  const pendingProviderId = usePendingProviderStore((s) => s.pendingProviderId);
  const clearPendingProviderId = usePendingProviderStore((s) => s.clearPendingProviderId);
  const pendingAccountType = useSignupIntentStore((s) => s.pendingAccountType);
  const clearPendingAccountType = useSignupIntentStore((s) => s.clearPendingAccountType);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!isHydrated || !isSessionHydrated) return;
    const inAuthGroup = segments[0] === '(auth)';
    const inInviteRoute = String(segments[0]) === 'invite';
    const inProviderShareRoute = String(segments[0]) === 'provider-share';
    const inOnboarding = String(segments[0]) === 'onboarding';

    if (
      !accessToken &&
      !hasSeenOnboarding &&
      !inOnboarding &&
      !inInviteRoute &&
      !inProviderShareRoute
    ) {
      router.replace('/onboarding');
      return;
    }

    if (
      !accessToken &&
      hasSeenOnboarding &&
      !inAuthGroup &&
      !inInviteRoute &&
      !inProviderShareRoute
    ) {
      router.replace('/(auth)');
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

    // A shared-profile link captured by provider-share/[id] before sign-in
    // resolved — deliver it now, ahead of the ordinary role routing below,
    // since /provider/[id] is a neutral route neither branch would otherwise
    // send anyone to.
    if (pendingProviderId && segments[0] !== 'provider') {
      clearPendingProviderId();
      router.replace({ pathname: '/provider/[id]', params: { id: pendingProviderId } });
      return;
    }

    // The sign-up screen's "I'm a stylist" choice, captured before the
    // account even existed to check against. Only forces anything when it's
    // 'provider' and no profile has been created yet — cleared immediately
    // (not on the profile actually being created) so backing out of
    // provider-setup lands as a normal client rather than re-trapping them
    // here on every cold start. 'client', or 'provider' with a profile
    // already made (e.g. signing in again on a new device), has nothing to
    // do here and just clears the stray flag.
    if (pendingAccountType === 'provider' && !me.hasProviderProfile) {
      clearPendingAccountType();
      if (segments[0] !== 'provider-setup') {
        router.replace('/provider-setup');
      }
      return;
    } else if (pendingAccountType) {
      clearPendingAccountType();
    }

    const inProviderGroup = segments[0] === '(provider)';
    const inClientGroup = segments[0] === '(tabs)';
    const wantsProvider = me.activeRole === 'provider' && me.hasProviderProfile;
    const onCompleteProfile = segments[0] === 'complete-profile';
    const leavingAuthentication = inAuthGroup || inOnboarding;

    // Three cases collapse to the same fix: sitting on the now-finished name
    // prompt, or on the wrong side of the client/provider split either way.
    // Neutral routes such as /chat, /map and /market are shared by both
    // roles. Redirect only when the user is actually inside the opposite tab
    // group; otherwise opening a provider conversation bounces to Jobs.
    if (
      leavingAuthentication ||
      onCompleteProfile ||
      (wantsProvider && inClientGroup) ||
      (!wantsProvider && inProviderGroup)
    ) {
      router.replace(wantsProvider ? '/(provider)/jobs' : '/(tabs)');
    }
  }, [
    isHydrated,
    isSessionHydrated,
    hasSeenOnboarding,
    accessToken,
    segments,
    me,
    pendingProviderId,
    clearPendingProviderId,
    pendingAccountType,
    clearPendingAccountType,
  ]);

  return isHydrated && isSessionHydrated;
}

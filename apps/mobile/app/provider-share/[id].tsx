import { useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen, ScreenHeader, Text } from '@sc/ui';
import { useAuthStore, usePendingProviderStore, useSessionStore } from '../../src/state/index.js';

/**
 * Landing point for a shared "check out my profile" link
 * (`stylistscenter://provider-share/[id]`) — mirrors invite/[code].tsx.
 *
 * `/provider/[id]` itself is not the link target: its data comes from an
 * authenticated-only endpoint (providers.controller.ts is signed-in-only on
 * purpose, to stop the whole catalogue being scraped), and it isn't on the
 * auth gate's allowlist, so an unauthenticated tap would just get bounced to
 * sign-in with the id lost. This route captures the id first, then either
 * goes straight there (already signed in) or waits for sign-in to finish and
 * lets useAuthGate deliver it afterwards.
 */
export default function ProviderShareLanding() {
  const params = useLocalSearchParams<{ id?: string }>();
  const accessToken = useAuthStore((state) => state.accessToken);
  const hasSeenOnboarding = useSessionStore((state) => state.hasSeenOnboarding);
  const setPendingProviderId = usePendingProviderStore((state) => state.setPendingProviderId);
  const providerId = params.id;

  useEffect(() => {
    if (!providerId?.trim()) {
      router.replace('/(auth)');
      return;
    }
    if (accessToken) {
      router.replace({ pathname: '/provider/[id]', params: { id: providerId } });
      return;
    }
    setPendingProviderId(providerId);
    router.replace(hasSeenOnboarding ? '/(auth)' : '/onboarding');
  }, [accessToken, hasSeenOnboarding, providerId, setPendingProviderId]);

  return (
    <Screen header={<ScreenHeader title="Stylist profile" showBack={false} />}>
      <Text variant="h2Small">Opening a shared profile</Text>
      <Text variant="body" color="neutral700">
        Sign in and we&apos;ll take you straight there.
      </Text>
    </Screen>
  );
}

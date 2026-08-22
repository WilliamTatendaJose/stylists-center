import { useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen, ScreenHeader, Text } from '@sc/ui';
import { useAuthStore, useInviteStore } from '../../src/state/index.js';

/** Captures a shared invite before authentication, then lets the root layout
 * claim it automatically once the WhatsApp sign-in finishes. */
export default function InviteLanding() {
  const params = useLocalSearchParams<{ code?: string }>();
  const accessToken = useAuthStore((state) => state.accessToken);
  const setPendingReferralCode = useInviteStore((state) => state.setPendingReferralCode);
  const referralCode = params.code;

  useEffect(() => {
    if (!referralCode?.trim()) {
      router.replace('/(auth)/index');
      return;
    }
    setPendingReferralCode(referralCode);
    router.replace(accessToken ? '/(tabs)' : '/(auth)/index');
  }, [accessToken, referralCode, setPendingReferralCode]);

  return (
    <Screen header={<ScreenHeader title="Invite" showBack={false} />}>
      <Text variant="h2Small">You&apos;ve been invited</Text>
      <Text variant="body" color="neutral700">
        Create an account or sign in and we&apos;ll apply the invite to your account automatically.
      </Text>
    </Screen>
  );
}

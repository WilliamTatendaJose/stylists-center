import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Check, Mail, RefreshCw } from 'lucide-react-native';
import { Button, Pressable, Text } from '@sc/ui';
import { color, radius, space } from '@sc/tokens';
import { AuthFooter, AuthLink, AuthShell, SecureNote } from '../../src/components/AuthChrome.js';
import {
  currentFirebaseEmail,
  firebaseErrorMessage,
  refreshVerificationAndContinue,
  resendVerification,
} from '../../src/auth/firebaseAuth.js';

const styles = StyleSheet.create({
  panel: {
    borderRadius: radius.card,
    backgroundColor: color.surface,
    alignItems: 'center',
    padding: space.xl,
    gap: space.m,
  },
  mailIcon: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: color.accent100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.s,
  },
  panelTitle: { textAlign: 'center', marginBottom: 2 },
  panelBody: { textAlign: 'center' },
  address: { color: color.neutral900 },
  resend: { flexDirection: 'row', alignItems: 'center', gap: space.s, minHeight: 44 },
  success: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  change: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4 },
});

export default function VerifyEmail() {
  const params = useLocalSearchParams<{ email?: string }>();
  const email = String(params.email ?? currentFirebaseEmail() ?? 'your email address');
  const [resent, setResent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const maskedEmail = useMemo(() => {
    if (!email.includes('@')) return email;
    const [name, domain] = email.split('@');
    if (!name || !domain) return email;
    const visible = name.slice(0, 2);
    return `${visible}${'*'.repeat(Math.max(1, name.length - 2))}@${domain}`;
  }, [email]);

  const continueAfterVerification = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const verified = await refreshVerificationAndContinue();
      if (!verified) {
        setError('Your email is not verified yet. Open the latest link, then try again.');
        return;
      }
      router.replace('/(tabs)');
    } catch (reason) {
      setError(firebaseErrorMessage(reason));
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      await resendVerification();
      setResent(true);
    } catch (reason) {
      setError(firebaseErrorMessage(reason));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="One quick check."
      subtitle="Verify your email to keep your account secure and unlock every part of Stylists Center."
      showHero={false}
    >
      <View style={styles.panel}>
        <View style={styles.mailIcon}>
          <Mail size={30} color={color.accent700} strokeWidth={1.7} />
        </View>
        <View>
          <Text variant="h3" style={styles.panelTitle}>
            Check your inbox
          </Text>
          <Text variant="body" color="neutral700" style={styles.panelBody}>
            We sent a verification link to{' '}
            <Text variant="bodyStrong" style={styles.address}>
              {maskedEmail}
            </Text>
          </Text>
        </View>
      </View>

      <AuthFooter>
        <Button
          label="I've verified my email"
          block
          size="lg"
          arrow
          loading={loading}
          onPress={() => void continueAfterVerification()}
        />
        <Pressable
          accessibilityRole="button"
          onPress={() => void resend()}
          disabled={loading}
          style={styles.resend}
        >
          <RefreshCw size={16} color={color.accent700} strokeWidth={1.9} />
          <Text variant="bodyStrong" color="accent700">
            Send the link again
          </Text>
        </Pressable>
        {resent ? (
          <View style={styles.success}>
            <Check size={16} color={color.accent700} strokeWidth={2.2} />
            <Text variant="meta" color="accent700" accessibilityLiveRegion="polite">
              A fresh link is on its way.
            </Text>
          </View>
        ) : null}
        {error ? (
          <Text variant="meta" color="accent700" accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        <View style={styles.change}>
          <Text variant="meta" color="neutral700">
            Wrong email?
          </Text>
          <AuthLink label="Go back" onPress={() => router.back()} />
        </View>
        <SecureNote>We never share your email with other members.</SecureNote>
      </AuthFooter>
    </AuthShell>
  );
}

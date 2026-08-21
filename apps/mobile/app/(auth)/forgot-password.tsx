import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ArrowLeft, MailCheck } from 'lucide-react-native';
import { Button, Pressable, Text, useTheme } from '@sc/ui';
import { radius, space } from '@sc/tokens';
import {
  AuthField,
  AuthFooter,
  AuthLink,
  AuthShell,
  SecureNote,
} from '../../src/components/AuthChrome.js';
import { firebaseErrorMessage, sendPasswordReset } from '../../src/auth/firebaseAuth.js';

const styles = StyleSheet.create({
  form: { gap: space.l },
  success: {
    borderRadius: radius.card,
    padding: space.l,
    gap: space.m,
  },
  successIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successTitle: { marginBottom: 2 },
  backRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: space.xs },
});

export default function ForgotPassword() {
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canSubmit = email.trim().length > 3;

  const submit = async () => {
    if (!canSubmit || loading) return;
    setLoading(true);
    setError(null);
    try {
      await sendPasswordReset(email.trim());
      setSent(true);
    } catch (reason) {
      setError(firebaseErrorMessage(reason));
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <AuthShell
        title="Check your inbox."
        subtitle="If an account exists for that email, we’ll send a secure link to reset your password."
        showHero={false}
      >
        <View style={[styles.success, { backgroundColor: colors.accent100 }]}>
          <View style={[styles.successIcon, { backgroundColor: colors.bg }]}>
            <MailCheck size={21} color={colors.accent700} strokeWidth={1.9} />
          </View>
          <View>
            <Text variant="cardTitle" style={styles.successTitle}>
              Reset link on its way
            </Text>
            <Text variant="meta" color="neutral700">
              Check {email.trim()} and follow the link. It may take a minute to arrive.
            </Text>
          </View>
        </View>
        <AuthFooter>
          <Button
            label="Back to sign in"
            block
            size="lg"
            onPress={() => router.replace('/(auth)/sign-in')}
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => setSent(false)}
            style={styles.backRow}
          >
            <Text variant="meta" color="accent700">
              Use a different email
            </Text>
          </Pressable>
          <SecureNote />
        </AuthFooter>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Forgot your password?"
      subtitle="No stress. Enter the email on your account and we’ll help you get back in."
      showHero={false}
    >
      <View style={styles.form}>
        <AuthField
          label="Email address"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          autoFocus
        />
        <Button
          label="Send reset link"
          block
          size="lg"
          arrow
          loading={loading}
          disabled={!canSubmit}
          onPress={() => void submit()}
        />
        {error ? (
          <Text variant="meta" color="accent700" accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
      </View>
      <AuthFooter>
        <SecureNote>Password reset links expire for your safety.</SecureNote>
        <View style={styles.backRow}>
          <ArrowLeft size={15} color={colors.accent700} strokeWidth={2} />
          <AuthLink label="Back to sign in" onPress={() => router.replace('/(auth)/sign-in')} />
        </View>
      </AuthFooter>
    </AuthShell>
  );
}

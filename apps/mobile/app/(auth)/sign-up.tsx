import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Check, Circle } from 'lucide-react-native';
import { Button, Text, useTheme } from '@sc/ui';
import { space } from '@sc/tokens';
import {
  AuthDivider,
  AuthField,
  AuthFooter,
  AuthGoogleButton,
  AuthLink,
  AuthShell,
  SecureNote,
} from '../../src/components/AuthChrome.js';
import {
  createAccount,
  firebaseErrorMessage,
  signInWithGoogle,
} from '../../src/auth/firebaseAuth.js';

const styles = StyleSheet.create({
  form: { gap: space.l },
  passwordHint: { gap: space.s, marginTop: -space.s },
  rule: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  ruleIcon: { width: 16, alignItems: 'center' },
  join: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4 },
  legal: { textAlign: 'center' },
});

function PasswordRule({ label, passed }: { label: string; passed: boolean }) {
  const { colors } = useTheme();

  return (
    <View style={styles.rule}>
      <View style={styles.ruleIcon}>
        {passed ? (
          <Check size={14} color={colors.accent700} strokeWidth={2.4} />
        ) : (
          <Circle size={10} color={colors.neutral700} strokeWidth={1.5} />
        )}
      </View>
      <Text variant="meta" color={passed ? 'accent700' : 'neutral700'}>
        {label}
      </Text>
    </View>
  );
}

export default function SignUp() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rules = useMemo(
    () => ({
      length: password.length >= 8,
      number: /\d/.test(password),
      letter: /[A-Za-z]/.test(password),
    }),
    [password],
  );
  const canSubmit = email.trim().length > 3 && Object.values(rules).every(Boolean);

  const submit = async () => {
    if (!canSubmit || loading) return;
    setLoading(true);
    setError(null);
    try {
      const result = await createAccount(email.trim(), password);
      if (!result.needsEmailVerification) {
        return;
      }
      router.replace({
        pathname: '/(auth)/verify-email',
        params: { email: email.trim() },
      });
    } catch (reason) {
      setError(firebaseErrorMessage(reason));
    } finally {
      setLoading(false);
    }
  };

  const submitGoogle = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const result = await signInWithGoogle();
      if (!result) return;
      if (result.needsEmailVerification) {
        router.replace('/(auth)/verify-email');
        return;
      }
    } catch (reason) {
      setError(firebaseErrorMessage(reason));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Make room for good hair days."
      subtitle="Create your account and meet the people, places, and products that make you feel like you."
      showHero={false}
    >
      <View style={styles.form}>
        <AuthGoogleButton onPress={() => void submitGoogle()} disabled={loading} />
        <AuthDivider />
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
        <AuthField
          label="Create a password"
          value={password}
          onChangeText={setPassword}
          placeholder="At least 8 characters"
          secure={!showPassword}
          onToggleSecure={() => setShowPassword((visible) => !visible)}
          autoComplete="new-password"
          textContentType="newPassword"
        />
        <View style={styles.passwordHint}>
          <PasswordRule label="8 characters or more" passed={rules.length} />
          <PasswordRule label="At least one letter" passed={rules.letter} />
          <PasswordRule label="At least one number" passed={rules.number} />
        </View>
        {error ? (
          <Text variant="meta" color="accent700" accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        <Button
          label="Create account"
          block
          size="lg"
          arrow
          loading={loading}
          disabled={!canSubmit}
          onPress={() => void submit()}
        />
      </View>

      <AuthFooter>
        <SecureNote>Email verification keeps your account safe.</SecureNote>
        <View style={styles.join}>
          <Text variant="body" color="neutral700">
            Already have an account?
          </Text>
          <AuthLink label="Sign in" onPress={() => router.replace('/(auth)/sign-in')} />
        </View>
        <Text variant="metaSmall" color="neutral700" style={styles.legal}>
          By creating an account, you agree to our Terms and Privacy Policy.
        </Text>
      </AuthFooter>
    </AuthShell>
  );
}

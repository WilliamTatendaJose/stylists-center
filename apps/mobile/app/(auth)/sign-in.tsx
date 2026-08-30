import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Pressable, Text } from '@sc/ui';
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
  firebaseErrorMessage,
  signInWithEmail,
  signInWithGoogle,
} from '../../src/auth/firebaseAuth.js';

const styles = StyleSheet.create({
  form: { gap: space.l },
  forgot: { alignSelf: 'flex-end', minHeight: 44, justifyContent: 'center' },
  error: { marginTop: -space.s },
  join: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4 },
  legal: { textAlign: 'center' },
});

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const canSubmit = email.trim().length > 3 && password.length > 0;

  const submitEmail = async () => {
    if (!canSubmit || loading) return;
    setLoading(true);
    setError(null);
    try {
      const result = await signInWithEmail(email.trim(), password);
      if (result.needsEmailVerification) {
        router.replace({
          pathname: '/(auth)/verify-email',
          params: { email: email.trim() },
        });
        return;
      }
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
        router.replace({ pathname: '/(auth)/verify-email' });
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
      title="Welcome back."
      subtitle="Sign in to pick up where you left off. Your next great look is waiting."
      showHero={false}
    >
      <View style={styles.form}>
        <AuthGoogleButton onPress={() => void submitGoogle()} disabled={loading} />
        <AuthDivider />
        <AuthField
          label="Email address"
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            setError(null);
          }}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="next"
          autoFocus
        />
        <View>
          <AuthField
            label="Password"
            value={password}
            onChangeText={(value) => {
              setPassword(value);
              setError(null);
            }}
            placeholder="Your password"
            secure={!showPassword}
            onToggleSecure={() => setShowPassword((visible) => !visible)}
            autoComplete="password"
            textContentType="password"
            returnKeyType="done"
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/(auth)/forgot-password')}
            style={styles.forgot}
          >
            <Text variant="meta" color="accent700">
              Forgot password?
            </Text>
          </Pressable>
        </View>
        {error ? (
          <Text variant="meta" color="accent700" style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        <Button
          label="Sign in"
          block
          size="lg"
          arrow
          loading={loading}
          disabled={!canSubmit}
          onPress={() => void submitEmail()}
        />
      </View>

      <AuthFooter>
        <SecureNote />
        <View style={styles.join}>
          <Text variant="body" color="neutral700">
            New to Style Center?
          </Text>
          <AuthLink label="Create an account" onPress={() => router.push('/(auth)/sign-up')} />
        </View>
        <Text variant="metaSmall" color="neutral700" style={styles.legal}>
          By continuing, you agree to our Terms and Privacy Policy.
        </Text>
      </AuthFooter>
    </AuthShell>
  );
}

import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { color, space } from '@sc/tokens';
import type { AuthTokens, RequestOtpResponse } from '@sc/shared';
import { Screen, ScreenHeader, Text, TextField, Button, Pressable } from '@sc/ui';
import { apiFetch, ApiError } from '../../src/api/client.js';
import { useAuthStore } from '../../src/state/index.js';
import { useBack } from '../../src/navigation/useBack.js';

const styles = StyleSheet.create({
  body: { marginBottom: space.xxl },
  field: { marginBottom: space.m },
  error: { marginTop: space.s, marginBottom: space.m },
  resend: { marginTop: space.l, alignSelf: 'center' },
});

export default function OtpEntry() {
  const onBack = useBack('/(auth)/phone');
  const params = useLocalSearchParams<{ challengeId: string; phone: string }>();
  const [challengeId, setChallengeId] = useState(params.challengeId);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setSession = useAuthStore((s) => s.setSession);

  const canSubmit = code.length === 6 && !loading;

  const verify = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      const tokens = await apiFetch<AuthTokens>('/v1/auth/otp/verify', {
        method: 'POST',
        body: { challengeId, code },
        auth: false,
      });
      await setSession(tokens);
      router.replace('/(tabs)');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't verify — check your connection.");
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    setResending(true);
    setError(null);
    try {
      const response = await apiFetch<RequestOtpResponse>('/v1/auth/otp/request', {
        method: 'POST',
        body: { phone: params.phone },
        auth: false,
      });
      setChallengeId(response.challengeId);
      setCode('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't resend — check your connection.");
    } finally {
      setResending(false);
    }
  };

  return (
    <Screen header={<ScreenHeader title="Verify" onBack={onBack} />}>
      <Text variant="body" color="neutral700" style={styles.body}>
        Enter the 6-digit code we sent to {params.phone}.
      </Text>

      <View style={styles.field}>
        <TextField
          label="Code"
          value={code}
          onChangeText={setCode}
          placeholder="000000"
          keyboardType="number-pad"
          maxLength={6}
          textAlign="center"
          autoFocus
        />
      </View>

      {error ? (
        <Text variant="meta" color={color.accent700} style={styles.error}>
          {error}
        </Text>
      ) : null}

      <Button
        label={loading ? 'Verifying…' : 'Verify'}
        block
        size="lg"
        arrow
        disabled={!canSubmit}
        onPress={() => {
          void verify();
        }}
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Resend code"
        disabled={resending}
        onPress={() => {
          void resend();
        }}
        style={styles.resend}
      >
        <Text variant="meta" color={color.accent700}>
          {resending ? 'Resending…' : "Didn't get it? Resend code"}
        </Text>
      </Pressable>
    </Screen>
  );
}

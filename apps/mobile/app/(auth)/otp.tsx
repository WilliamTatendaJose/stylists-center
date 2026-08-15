import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { MessageCircle } from 'lucide-react-native';
import { color, radius, space } from '@sc/tokens';
import type { AuthTokens, RequestOtpResponse } from '@sc/shared';
import { Screen, ScreenHeader, Text, TextField, Button, Pressable } from '@sc/ui';
import { apiFetch } from '../../src/api/client.js';
import { describeError, isRejectedCode } from '../../src/api/errorMessage.js';
import { useAuthStore } from '../../src/state/index.js';
import { useBack } from '../../src/navigation/useBack.js';

const styles = StyleSheet.create({
  channel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    padding: space.l,
    marginBottom: space.xxl,
    borderRadius: radius.tile,
    backgroundColor: color.neutral900,
  },
  channelIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: color.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grow: { flex: 1, minWidth: 0 },
  body: { marginTop: 2 },
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
  const [resent, setResent] = useState(false);
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
      setError(describeError(err, "Couldn't verify the code. Try again."));
      // Only a rejected code should be cleared. Wiping the field after a
      // dropped connection would make the user retype six digits that were
      // never actually wrong.
      if (isRejectedCode(err)) setCode('');
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    setResending(true);
    setError(null);
    setResent(false);
    try {
      const response = await apiFetch<RequestOtpResponse>('/v1/auth/otp/request', {
        method: 'POST',
        body: { phone: params.phone, channel: 'sms' },
        auth: false,
      });
      // Only swap the challenge once the new one exists. Clearing it up front
      // would strand the screen with no valid challenge if the request failed.
      setChallengeId(response.challengeId);
      setCode('');
      setResent(true);
    } catch (err) {
      setError(describeError(err, "Couldn't send a new code. Try again."));
    } finally {
      setResending(false);
    }
  };

  return (
    <Screen header={<ScreenHeader title="Verify" onBack={onBack} />}>
      <View style={styles.channel}>
        <View style={styles.channelIcon}>
          <MessageCircle size={22} color={color.accent700} strokeWidth={1.9} />
        </View>
        <View style={styles.grow}>
          <Text variant="cardTitle" color={color.onDark.text}>
            Check your WhatsApp
          </Text>
          <Text variant="meta" color={color.onDark.body} style={styles.body}>
            We sent a 6-digit code to {params.phone}.
          </Text>
        </View>
      </View>

      <View style={styles.field}>
        <TextField
          label="Code"
          value={code}
          onChangeText={(next) => {
            setCode(next);
            setError(null);
          }}
          placeholder="000000"
          keyboardType="number-pad"
          maxLength={6}
          textAlign="center"
          autoFocus
        />
      </View>

      {error ? (
        <Text
          variant="meta"
          color={color.accent700}
          style={styles.error}
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
        >
          {error}
        </Text>
      ) : null}

      {!error && resent ? (
        <Text
          variant="meta"
          color="neutral700"
          style={styles.error}
          accessibilityLiveRegion="polite"
        >
          New code sent by SMS.
        </Text>
      ) : null}

      <Button
        label={loading ? 'Verifying…' : 'Verify and continue'}
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
          {resending ? 'Sending SMS…' : "Didn't get it? Use SMS instead"}
        </Text>
      </Pressable>
    </Screen>
  );
}

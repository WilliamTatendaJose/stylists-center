import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { color, space } from '@sc/tokens';
import type { RequestOtpResponse } from '@sc/shared';
import { Screen, ScreenHeader, Text, TextField, Button } from '@sc/ui';
import { apiFetch, ApiError } from '../../src/api/client.js';

const styles = StyleSheet.create({
  body: { marginBottom: space.xxl },
  field: { marginBottom: space.m },
  error: { marginTop: space.s, marginBottom: space.m },
});

/** Phone entry (SRS auth, plan §6/§11 R4: phone + OTP, WhatsApp-first with SMS fallback). */
export default function PhoneEntry() {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = phone.trim().length >= 6 && !loading;

  const sendCode = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch<RequestOtpResponse>('/v1/auth/otp/request', {
        method: 'POST',
        body: { phone: phone.trim() },
        auth: false,
      });
      router.push({
        pathname: '/(auth)/otp',
        params: { challengeId: response.challengeId, phone: phone.trim() },
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't send a code — check your connection.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen header={<ScreenHeader title="Sign in" showBack={false} />}>
      <Text variant="body" color="neutral700" style={styles.body}>
        Enter your phone number to get started. We&apos;ll text you a code — no password needed.
      </Text>

      <View style={styles.field}>
        <TextField
          label="Phone number"
          value={phone}
          onChangeText={setPhone}
          placeholder="077 000 0000"
          keyboardType="phone-pad"
          autoFocus
        />
      </View>

      {error ? (
        <Text variant="meta" color={color.accent700} style={styles.error}>
          {error}
        </Text>
      ) : null}

      <Button
        label={loading ? 'Sending…' : 'Send code'}
        block
        size="lg"
        arrow
        disabled={!canSubmit}
        onPress={() => {
          void sendCode();
        }}
      />
    </Screen>
  );
}

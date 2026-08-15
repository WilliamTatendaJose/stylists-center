import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { MessageCircle, ShieldCheck } from 'lucide-react-native';
import { color, radius, space } from '@sc/tokens';
import type { RequestOtpResponse } from '@sc/shared';
import { Screen, ScreenHeader, Text, TextField, Button, Card } from '@sc/ui';
import { apiFetch } from '../../src/api/client.js';
import { describeError, isValidationError } from '../../src/api/errorMessage.js';

const styles = StyleSheet.create({
  hero: { padding: space.xxl, marginBottom: space.xxl, backgroundColor: color.neutral900 },
  icon: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: color.bg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.l,
  },
  heroTitle: { marginBottom: space.s },
  body: { marginBottom: space.m },
  secureRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  field: { marginBottom: space.m },
  error: { marginTop: space.s, marginBottom: space.m },
  hint: { marginTop: space.m, textAlign: 'center' },
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
      setError(
        isValidationError(err)
          ? "That doesn't look like a Zimbabwean mobile number. Enter it as 077 123 4567."
          : describeError(err, "Couldn't send a code. Try again."),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen header={<ScreenHeader title="Sign in" showBack={false} />}>
      <Card style={styles.hero}>
        <View style={styles.icon}>
          <MessageCircle size={25} color={color.accent700} strokeWidth={1.9} />
        </View>
        <Text variant="h2Small" color={color.onDark.text} style={styles.heroTitle}>
          Continue with WhatsApp
        </Text>
        <Text variant="body" color={color.onDark.body} style={styles.body}>
          Enter your Zimbabwean mobile number. We&apos;ll send a 6-digit code to WhatsApp.
        </Text>
        <View style={styles.secureRow}>
          <ShieldCheck size={17} color={color.accent400} strokeWidth={1.9} />
          <Text variant="meta" color={color.onDark.body}>
            Secure sign-in. No password to remember.
          </Text>
        </View>
      </Card>

      <View style={styles.field}>
        <TextField
          label="Phone number"
          value={phone}
          onChangeText={(next) => {
            setPhone(next);
            setError(null);
          }}
          placeholder="077 000 0000"
          keyboardType="phone-pad"
          autoFocus
        />
      </View>

      {/* accessibilityLiveRegion so the failure is announced rather than
          silently appearing below a field the user may have already left. */}
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

      <Button
        label={loading ? 'Sending…' : 'Send WhatsApp code'}
        block
        size="lg"
        arrow
        disabled={!canSubmit}
        onPress={() => {
          void sendCode();
        }}
      />
      <Text variant="metaSmall" color="neutral600" style={styles.hint}>
        If WhatsApp delivery fails, you can request an SMS on the next screen.
      </Text>
    </Screen>
  );
}

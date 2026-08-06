import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { color, space } from '@sc/tokens';
import { Screen, ScreenHeader, Text, TextField, Button } from '@sc/ui';
import { useMe, useUpdateProfile } from '../src/api/hooks/useMe.js';
import { describeError } from '../src/api/errorMessage.js';

const styles = StyleSheet.create({
  intro: { marginBottom: space.xxl },
  field: { marginBottom: space.l },
  footer: { gap: space.s },
});

/**
 * A brand-new account's `displayName` is its own phone number (see
 * auth.service.ts) until this screen replaces it — every other screen shows
 * that name to other people (a booking counterparty, a chat thread, a
 * stylist page), so shipping without ever collecting a real one meant a
 * client or provider could go their whole time on the app looking like a
 * phone number to everyone they dealt with. No back button: the auth gate
 * (useAuthGate) routes here whenever `me.profileComplete` is false and
 * routes away the moment it flips true, for both client and provider roles.
 */
export default function CompleteProfile() {
  const { data: me } = useMe();
  const updateProfile = useUpdateProfile();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const canSubmit = name.trim().length >= 2 && !updateProfile.isPending;

  const submit = () => {
    if (!canSubmit) return;
    setError(null);
    updateProfile.mutate(
      { displayName: name.trim() },
      {
        onError: (err) => {
          setError(describeError(err, "Couldn't save that. Try again."));
        },
      },
    );
  };

  return (
    <Screen
      header={<ScreenHeader title="Complete your profile" showBack={false} />}
      footer={
        <View style={styles.footer}>
          {error ? (
            <Text
              variant="meta"
              color={color.accent700}
              accessibilityLiveRegion="polite"
              accessibilityRole="alert"
            >
              {error}
            </Text>
          ) : null}
          <Button
            label={updateProfile.isPending ? 'Saving…' : 'Continue'}
            onPress={submit}
            block
            size="lg"
            arrow
            disabled={!canSubmit}
          />
        </View>
      }
    >
      <Text variant="body" color="neutral700" style={styles.intro}>
        One last thing before you get started — what should{' '}
        {me?.activeRole === 'provider' ? 'clients' : 'stylists'} call you? This is the name shown
        on bookings and chats.
      </Text>

      <View style={styles.field}>
        <TextField
          label="Your name"
          value={name}
          onChangeText={setName}
          placeholder="e.g. Tariro Moyo"
          autoFocus
        />
      </View>
    </Screen>
  );
}

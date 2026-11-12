import { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { space } from '@sc/tokens';
import { Button, Card, Text, useTheme } from '@sc/ui';
import { apiFetch } from '../api/client.js';
import { registerPushToken, type PushRegistration } from '../notifications/registerPushToken.js';
import { useMe, useUpdateNotificationPreferences } from '../api/hooks/useMe.js';
import { describeError } from '../api/errorMessage.js';

const styles = StyleSheet.create({
  card: { padding: space.l, gap: space.m },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.m },
  copy: { flex: 1 },
});

interface PushTestResult {
  devices: number;
  delivered: number;
  errors: string[];
}

/** Plain-language outcome of a test notification. */
export function describePushTest(
  result: PushTestResult,
  registration: PushRegistration = 'registered',
): string {
  if (result.devices === 0) {
    if (registration === 'unavailable') {
      return "This version of the app can't receive notifications yet. They will start working after the next app update from the store.";
    }
    if (registration === 'failed') {
      return "This phone couldn't sign up for notifications. Check your connection, then try again.";
    }
    return "This phone isn't set up for notifications yet. Allow notifications for Style Center in your phone's settings, then try again.";
  }
  if (result.delivered > 0) {
    return "Test sent. It should arrive in a few seconds. If it doesn't, check that notifications for Style Center are on in your phone's settings.";
  }
  if (result.errors.includes('InvalidCredentials')) {
    return "Notifications can't be delivered yet because the app's push setup isn't finished. Please let StylistsCenter support know.";
  }
  if (result.errors.includes('DeviceNotRegistered')) {
    return 'This phone needs to sign up for notifications again. Close and reopen the app, then try again.';
  }
  return `The test couldn't be sent (${result.errors.join(', ') || 'unknown reason'}). Try again later.`;
}

export function NotificationPreferences() {
  const { colors } = useTheme();
  const { data: me } = useMe();
  const update = useUpdateNotificationPreferences();
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const test = useMutation({
    mutationFn: async () => {
      // Register first: this asks for permission if needed and refreshes the
      // phone's token, so the test checks the current setup.
      const registration = await registerPushToken().catch((): PushRegistration => 'failed');
      const result = await apiFetch<PushTestResult>('/v1/me/push-test', { method: 'POST' });
      return { result, registration };
    },
    onSuccess: ({ result, registration }) => {
      setTestMessage(describePushTest(result, registration));
    },
    onError: (error) => {
      setTestMessage(describeError(error, "Couldn't send a test notification."));
    },
  });
  if (!me) return null;
  return (
    <Card bordered style={styles.card}>
      <View style={styles.row}>
        <View style={styles.copy}>
          <Text variant="bodyStrong">Appointment reminders</Text>
          <Text variant="meta" color="neutral700">
            A day and two hours before confirmed bookings.
          </Text>
        </View>
        <Switch
          accessibilityLabel="Appointment reminders"
          disabled={update.isPending}
          value={me.bookingRemindersEnabled}
          onValueChange={(bookingRemindersEnabled) =>
            update.mutate({
              bookingRemindersEnabled,
              pickupRemindersEnabled: me.pickupRemindersEnabled,
            })
          }
          trackColor={{ false: colors.neutral200, true: colors.accent700 }}
          thumbColor={colors.bg}
        />
      </View>
      <View style={styles.row}>
        <View style={styles.copy}>
          <Text variant="bodyStrong">Pickup reminders</Text>
          <Text variant="meta" color="neutral700">
            A follow-up if an order is still waiting for collection.
          </Text>
        </View>
        <Switch
          accessibilityLabel="Pickup reminders"
          disabled={update.isPending}
          value={me.pickupRemindersEnabled}
          onValueChange={(pickupRemindersEnabled) =>
            update.mutate({
              bookingRemindersEnabled: me.bookingRemindersEnabled,
              pickupRemindersEnabled,
            })
          }
          trackColor={{ false: colors.neutral200, true: colors.accent700 }}
          thumbColor={colors.bg}
        />
      </View>
      <Button
        label={test.isPending ? 'Sending…' : 'Send me a test notification'}
        variant="secondary"
        block
        disabled={test.isPending}
        onPress={() => {
          setTestMessage(null);
          test.mutate();
        }}
      />
      {testMessage ? (
        <Text variant="meta" color="neutral700" accessibilityLiveRegion="polite">
          {testMessage}
        </Text>
      ) : null}
      {update.isError ? (
        <Text variant="meta" color="accent700" accessibilityRole="alert">
          {describeError(update.error, "Couldn't save notification settings.")}
        </Text>
      ) : null}
    </Card>
  );
}

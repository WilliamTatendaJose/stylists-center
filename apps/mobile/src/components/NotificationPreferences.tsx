import { StyleSheet, Switch, View } from 'react-native';
import { space } from '@sc/tokens';
import { Card, Text, useTheme } from '@sc/ui';
import { useMe, useUpdateNotificationPreferences } from '../api/hooks/useMe.js';
import { describeError } from '../api/errorMessage.js';

const styles = StyleSheet.create({
  card: { padding: space.l, gap: space.m },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.m },
  copy: { flex: 1 },
});

export function NotificationPreferences() {
  const { colors } = useTheme();
  const { data: me } = useMe();
  const update = useUpdateNotificationPreferences();
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
      {update.isError ? (
        <Text variant="meta" color="accent700" accessibilityRole="alert">
          {describeError(update.error, "Couldn't save notification settings.")}
        </Text>
      ) : null}
    </Card>
  );
}

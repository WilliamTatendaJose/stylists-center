import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen, Text, Button, useTheme } from '@sc/ui';
import { space } from '@sc/tokens';
import { useBookingPaymentStatus } from '../../src/api/hooks/useBookings.js';

const POLL_TIMEOUT_MS = 90_000;

const styles = StyleSheet.create({
  body: { alignItems: 'center', paddingTop: space.xxl },
  spinner: { marginBottom: space.xl },
  title: { marginBottom: space.s, textAlign: 'center' },
  instructions: { marginBottom: space.xxl, textAlign: 'center' },
});

const SUCCESS_STATUSES = new Set(['held', 'paid', 'released']);
const FAILURE_STATUSES = new Set(['failed', 'refunded', 'disputed']);

/** Shown after Paynow pushes an EcoCash prompt to the client's phone — waits for and reflects the real outcome instead of assuming success. */
export default function Paying() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{
    bookingId?: string;
    instructions?: string;
    reference?: string;
    providerId?: string;
    providerName?: string;
    serviceName?: string;
    whenLabel?: string;
    areaName?: string;
  }>();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!params.bookingId || !params.providerId || !params.reference) {
      router.replace('/(tabs)');
    }
  }, [params.bookingId, params.providerId, params.reference]);

  const { data } = useBookingPaymentStatus(params.bookingId, !timedOut);
  const status = data?.status;

  useEffect(() => {
    if (!status || SUCCESS_STATUSES.has(status)) return;
    const timer = setTimeout(() => setTimedOut(true), POLL_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [status]);

  useEffect(() => {
    if (!status || !SUCCESS_STATUSES.has(status)) return;
    router.replace({
      pathname: '/book/done',
      params: {
        reference: params.reference,
        providerId: params.providerId,
        providerName: params.providerName,
        serviceName: params.serviceName,
        whenLabel: params.whenLabel,
        areaName: params.areaName,
        paymentLabel: 'Paynow — EcoCash, paid',
      },
    });
  }, [status, params]);

  if (!params.bookingId || !params.providerId || !params.reference) return null;

  const failed = status ? FAILURE_STATUSES.has(status) : false;

  const goBookings = () => router.replace('/(tabs)/bookings');
  const showExit = failed || timedOut;

  return (
    <Screen
      footer={showExit ? <Button label="My bookings" block onPress={goBookings} /> : undefined}
    >
      <View style={styles.body}>
        {showExit ? null : (
          <ActivityIndicator size="large" color={colors.accent} style={styles.spinner} />
        )}
        <Text variant="h3" style={styles.title}>
          {failed
            ? "Payment wasn't completed"
            : timedOut
              ? 'Still waiting on EcoCash'
              : 'Check your phone'}
        </Text>
        <Text variant="body" color="neutral700" style={styles.instructions}>
          {failed
            ? "Paynow reported this payment didn't go through. Your booking request is still on file, but unpaid — check My bookings for its status."
            : timedOut
              ? "This is taking longer than expected. Your booking request is on file — we'll update it as soon as Paynow confirms, or check My bookings for the latest status."
              : (params.instructions ??
                'Approve the EcoCash prompt on your phone to confirm this booking.')}
        </Text>
      </View>
    </Screen>
  );
}

import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Check } from 'lucide-react-native';
import { Screen, Text, Button, useTheme } from '@sc/ui';
import { space } from '@sc/tokens';
import { useBookingPaymentStatus } from '../../src/api/hooks/useBookings.js';

const POLL_TIMEOUT_MS = 90_000;

const styles = StyleSheet.create({
  body: { alignItems: 'center', paddingTop: space.xxl },
  spinner: { marginBottom: space.xl },
  tick: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xl,
  },
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
    checkoutUrl?: string;
    reference?: string;
    providerId?: string;
    providerName?: string;
    serviceName?: string;
    whenLabel?: string;
    areaName?: string;
  }>();
  const [timedOut, setTimedOut] = useState(false);
  const openedCheckout = useRef(false);

  useEffect(() => {
    if (!params.bookingId || !params.providerId || !params.reference) {
      router.replace('/(tabs)');
    }
  }, [params.bookingId, params.providerId, params.reference]);

  // Paynow fell back to its hosted page (no EcoCash prompt for this number).
  // The browser is how they pay; this screen still owns the verdict, so it
  // opens the page once and keeps polling behind it — closing the browser is
  // not an answer about whether the payment happened.
  useEffect(() => {
    if (!params.checkoutUrl || openedCheckout.current) return;
    openedCheckout.current = true;
    void WebBrowser.openBrowserAsync(params.checkoutUrl);
  }, [params.checkoutUrl]);

  const { data } = useBookingPaymentStatus(params.bookingId, !timedOut);
  const status = data?.status;

  useEffect(() => {
    if (!status || SUCCESS_STATUSES.has(status)) return;
    const timer = setTimeout(() => setTimedOut(true), POLL_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [status]);

  if (!params.bookingId || !params.providerId || !params.reference) return null;

  const paid = status ? SUCCESS_STATUSES.has(status) : false;
  const failed = status ? FAILURE_STATUSES.has(status) : false;
  const viaBrowser = Boolean(params.checkoutUrl);

  // Confirmed payments are NOT auto-forwarded. The whole point of this screen
  // is that the person sees Paynow's actual answer — bouncing straight to
  // "Booked." on success would hide the one moment that proves the money
  // moved, and reads exactly like the auto-complete this replaced.
  const goDone = () => {
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
  };
  const goBookings = () => router.replace('/(tabs)/bookings');
  const showExit = failed || timedOut;

  return (
    <Screen
      footer={
        paid ? (
          <Button label="Continue" block size="lg" arrow onPress={goDone} />
        ) : showExit ? (
          <Button label="My bookings" block onPress={goBookings} />
        ) : undefined
      }
    >
      <View style={styles.body}>
        {paid ? (
          <View style={[styles.tick, { borderColor: colors.accent }]}>
            <Check size={30} strokeWidth={2.4} color={colors.accent} />
          </View>
        ) : showExit ? null : (
          <ActivityIndicator size="large" color={colors.accent} style={styles.spinner} />
        )}
        <Text variant="h3" style={styles.title}>
          {paid
            ? 'Payment confirmed'
            : failed
              ? "Payment wasn't completed"
              : timedOut
                ? 'Still waiting on Paynow'
                : viaBrowser
                  ? 'Finish paying in Paynow'
                  : 'Check your phone'}
        </Text>
        <Text variant="body" color="neutral700" style={styles.instructions}>
          {paid
            ? `Paynow confirmed your payment for ${params.reference}. Your booking request is with ${params.providerName ?? 'the stylist'} now.`
            : failed
              ? "Paynow reported this payment didn't go through. Your booking request is still on file, but unpaid — check My bookings for its status."
              : timedOut
                ? "This is taking longer than expected. Your booking request is on file — we'll update it as soon as Paynow confirms, or check My bookings for the latest status."
                : (params.instructions ??
                  (viaBrowser
                    ? 'Complete the payment in the Paynow window. This screen updates on its own once it clears.'
                    : 'Approve the EcoCash prompt on your phone to confirm this booking.'))}
        </Text>
      </View>
    </Screen>
  );
}

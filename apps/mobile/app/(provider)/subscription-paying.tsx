import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Check } from 'lucide-react-native';
import { formatUsd } from '@sc/shared';
import { Screen, Text, Button, useTheme } from '@sc/ui';
import { space } from '@sc/tokens';
import { useSubscriptionPaymentStatus } from '../../src/api/hooks/useProviders.js';
import { usePendingSubscriptionStore } from '../../src/state/index.js';

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

export default function SubscriptionPaying() {
  const { colors } = useTheme();
  const pending = usePendingSubscriptionStore((s) => s.pending);
  const clearPending = usePendingSubscriptionStore((s) => s.clearPending);
  const [timedOut, setTimedOut] = useState(false);
  const openedCheckout = useRef(false);

  useEffect(() => {
    if (!pending) router.replace('/(provider)/profile');
  }, [pending]);

  useEffect(() => {
    if (!pending?.checkoutUrl || openedCheckout.current) return;
    openedCheckout.current = true;
    void WebBrowser.openBrowserAsync(pending.checkoutUrl);
  }, [pending?.checkoutUrl]);

  const { data } = useSubscriptionPaymentStatus(!!pending && !timedOut);
  const status = data?.status;

  useEffect(() => {
    if (!status || SUCCESS_STATUSES.has(status)) return;
    const timer = setTimeout(() => setTimedOut(true), POLL_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [status]);

  if (!pending) return null;

  const paid = status ? SUCCESS_STATUSES.has(status) : false;
  const failed = status ? FAILURE_STATUSES.has(status) : false;
  const viaBrowser = Boolean(pending.checkoutUrl);

  const goDone = () => {
    clearPending();
    router.replace('/(provider)/profile');
  };

  const goProfile = () => {
    clearPending();
    router.replace('/(provider)/profile');
  };

  const showExit = failed || timedOut;

  return (
    <Screen
      footer={
        paid ? (
          <Button label="Continue" block size="lg" arrow onPress={goDone} />
        ) : showExit ? (
          <Button label="Back to profile" block onPress={goProfile} />
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
            ? `Paynow confirmed your ${formatUsd(pending.priceUsdCents)} subscription payment. Your subscription has been extended.`
            : failed
              ? "Paynow reported this payment didn't go through, so your subscription hasn't been extended. Nothing was charged — you can try again whenever you're ready."
              : timedOut
                ? "This is taking longer than expected. Your subscription request is on file — we'll update it as soon as Paynow confirms."
                : (pending.instructions ??
                  (viaBrowser
                    ? 'Complete the payment in the Paynow window. This screen updates on its own once it clears.'
                    : `Approve the EcoCash prompt on your phone to confirm this ${formatUsd(pending.priceUsdCents)} subscription payment.`))}
        </Text>
      </View>
    </Screen>
  );
}

import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Check } from 'lucide-react-native';
import { formatUsd, PAY_CHANNEL_LABELS } from '@sc/shared';
import { Screen, Text, Button, useTheme } from '@sc/ui';
import { space } from '@sc/tokens';
import { useFeePaymentStatus } from '../../src/api/hooks/useFees.js';
import { usePendingFeePaymentStore } from '../../src/state/index.js';
import { PaymentActionPanel } from '../../src/components/PaymentActionPanel.js';

const POLL_TIMEOUT_MS = 90_000;
/** InnBucks and O'mari need the payer to switch apps or read an SMS, which takes longer than a prompt. */
const ACTION_POLL_TIMEOUT_MS = 5 * 60_000;
const SUCCESS_STATUSES = new Set(['held', 'paid', 'released']);
const FAILURE_STATUSES = new Set(['failed', 'refunded', 'disputed']);

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

/** Mirrors `/book/paying`, but settles a payment towards the stylist's or vendor's fees. */
export default function FeePaying() {
  const { colors } = useTheme();
  const pending = usePendingFeePaymentStore((state) => state.pending);
  const clearPending = usePendingFeePaymentStore((state) => state.clearPending);
  const [timedOut, setTimedOut] = useState(false);
  const openedCheckout = useRef(false);

  useEffect(() => {
    if (!pending) router.replace('/fees');
  }, [pending]);

  useEffect(() => {
    if (!pending?.checkoutUrl || openedCheckout.current) return;
    openedCheckout.current = true;
    void WebBrowser.openBrowserAsync(pending.checkoutUrl);
  }, [pending?.checkoutUrl]);

  const { data } = useFeePaymentStatus(Boolean(pending) && !timedOut);
  const status = data?.status;

  useEffect(() => {
    if (!status || SUCCESS_STATUSES.has(status)) return;
    const timer = setTimeout(
      () => setTimedOut(true),
      pending?.action ? ACTION_POLL_TIMEOUT_MS : POLL_TIMEOUT_MS,
    );
    return () => clearTimeout(timer);
  }, [status, pending?.action]);

  if (!pending) return null;

  const paid = status ? SUCCESS_STATUSES.has(status) : false;
  const failed = status ? FAILURE_STATUSES.has(status) : false;
  const viaBrowser = Boolean(pending.checkoutUrl);
  const channelLabel = PAY_CHANNEL_LABELS[pending.payChannel ?? 'ecocash'];
  const action = pending.action;
  const showExit = failed || timedOut;
  const leave = () => {
    clearPending();
    router.replace('/fees');
  };

  return (
    <Screen
      hasTabBar={false}
      footer={
        paid ? (
          <Button label="Continue" block size="lg" arrow onPress={leave} />
        ) : showExit ? (
          <Button label="Back to fees" block onPress={leave} />
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
                  : action?.kind === 'innbucks'
                    ? 'Approve in InnBucks'
                    : action?.kind === 'otp'
                      ? "Enter your O'mari code"
                      : 'Check your phone'}
        </Text>
        <Text variant="body" color="neutral700" style={styles.instructions}>
          {paid
            ? `Paynow confirmed your ${formatUsd(pending.amountUsdCents)} payment. It has been taken off what you owe.`
            : failed
              ? "Paynow reported this payment didn't go through, so what you owe hasn't changed. Nothing was charged. You can try again whenever you're ready."
              : timedOut
                ? 'This is taking longer than expected. Your payment is on file, and what you owe will update as soon as Paynow confirms.'
                : (pending.instructions ??
                  (viaBrowser
                    ? 'Complete the payment in the Paynow window. This screen updates on its own once it clears.'
                    : `Approve the ${channelLabel} prompt on your phone to pay ${formatUsd(pending.amountUsdCents)}.`))}
        </Text>
        {action && pending.reference && !paid && !showExit ? (
          <PaymentActionPanel action={action} reference={pending.reference} />
        ) : null}
      </View>
    </Screen>
  );
}

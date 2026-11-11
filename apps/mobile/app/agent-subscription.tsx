import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Check } from 'lucide-react-native';
import {
  formatInHarare,
  formatUsd,
  PAY_CHANNEL_LABELS,
  PHONE_PAY_CHANNELS,
  type PayAgentSubscriptionResponse,
  type PayChannel,
} from '@sc/shared';
import { space } from '@sc/tokens';
import { Button, RuleList, Screen, ScreenHeader, Text, useTheme } from '@sc/ui';
import {
  useAgentSubscription,
  useAgentSubscriptionPaymentStatus,
  usePayAgentSubscription,
} from '../src/api/hooks/useWallet.js';
import { useMe } from '../src/api/hooks/useMe.js';
import { usePayChannels } from '../src/api/hooks/usePayments.js';
import { describeError } from '../src/api/errorMessage.js';
import { OnlinePaymentFields, payerPhoneError } from '../src/components/OnlinePaymentFields.js';
import { PaymentActionPanel } from '../src/components/PaymentActionPanel.js';
import { useBack } from '../src/navigation/useBack.js';

const POLL_TIMEOUT_MS = 90_000;
/** InnBucks and O'mari need a switch of app or an SMS, which takes longer than a prompt. */
const ACTION_POLL_TIMEOUT_MS = 5 * 60_000;
const SUCCESS = new Set(['held', 'paid', 'released']);
const FAILURE = new Set(['failed', 'refunded', 'disputed']);

const styles = StyleSheet.create({
  section: { marginBottom: space.xxl },
  sectionLabel: { marginBottom: space.m },
  footer: { gap: space.s },
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
  message: { marginBottom: space.xxl, textAlign: 'center' },
});

/**
 * Pays the agent subscription, then waits for the gateway to confirm. One
 * screen rather than two: the payment in flight lives in local state, and
 * the server is the source of truth if the screen is closed (the wallet shows
 * the subscription as active once Paynow confirms).
 */
export default function AgentSubscriptionScreen() {
  const { colors } = useTheme();
  const onBack = useBack('/(tabs)/wallet');
  const { data: subscription } = useAgentSubscription();
  const { data: me } = useMe();
  const pay = usePayAgentSubscription();
  const { channels } = usePayChannels();
  const [chosen, setChosen] = useState<PayChannel>('ecocash');
  const channel = channels.includes(chosen) ? chosen : (channels[0] ?? 'ecocash');
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState<PayAgentSubscriptionResponse | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const openedCheckout = useRef(false);

  useEffect(() => {
    if (me?.phone) setPhone((current) => current || me.phone || '');
  }, [me?.phone]);

  useEffect(() => {
    if (!started?.checkoutUrl || openedCheckout.current) return;
    openedCheckout.current = true;
    void WebBrowser.openBrowserAsync(started.checkoutUrl);
  }, [started?.checkoutUrl]);

  const { data: polled } = useAgentSubscriptionPaymentStatus(
    started?.pending === true && !timedOut,
  );
  const status = polled?.status;
  const settled = started ? !started.pending || (status ? SUCCESS.has(status) : false) : false;
  const failed = status ? FAILURE.has(status) : false;

  useEffect(() => {
    if (!started?.pending || settled || failed) return;
    const timer = setTimeout(
      () => setTimedOut(true),
      started.action ? ACTION_POLL_TIMEOUT_MS : POLL_TIMEOUT_MS,
    );
    return () => clearTimeout(timer);
  }, [started, settled, failed]);

  const start = () => {
    const numberError = payerPhoneError(channel, phone);
    if (numberError) {
      setPhoneError(numberError);
      return;
    }
    setPhoneError(null);
    setError(null);
    setTimedOut(false);
    openedCheckout.current = false;
    pay.mutate(
      {
        payChannel: channel,
        ...(PHONE_PAY_CHANNELS.has(channel) ? { payerPhone: phone.trim() } : {}),
      },
      {
        onSuccess: setStarted,
        onError: (reason) =>
          setError(describeError(reason, "Couldn't take that payment. Try again.")),
      },
    );
  };

  const price = formatUsd(subscription?.priceUsdCents ?? 0);

  if (started) {
    const showExit = settled || failed || timedOut;
    const action = started.action;
    const paidUntil = polled?.paidUntil ?? started.paidUntil;
    return (
      <Screen
        hasTabBar={false}
        footer={
          showExit ? (
            <Button
              label={settled ? 'Done' : 'Back to wallet'}
              block
              size="lg"
              onPress={() => router.replace('/(tabs)/wallet')}
            />
          ) : undefined
        }
      >
        <View style={styles.body}>
          {settled ? (
            <View style={[styles.tick, { borderColor: colors.accent }]}>
              <Check size={30} strokeWidth={2.4} color={colors.accent} />
            </View>
          ) : showExit ? null : (
            <ActivityIndicator size="large" color={colors.accent} style={styles.spinner} />
          )}
          <Text variant="h3" style={styles.title}>
            {settled
              ? 'Subscription paid'
              : failed
                ? "Payment wasn't completed"
                : timedOut
                  ? 'Still waiting on Paynow'
                  : action?.kind === 'innbucks'
                    ? 'Approve in InnBucks'
                    : action?.kind === 'otp'
                      ? "Enter your O'mari code"
                      : 'Check your phone'}
          </Text>
          <Text variant="body" color="neutral700" style={styles.message}>
            {settled
              ? `Your agent subscription is active${paidUntil ? ` until ${formatInHarare(paidUntil, 'd MMM yyyy')}` : ''}.`
              : failed
                ? "The payment didn't go through, so nothing was charged. You can try again."
                : timedOut
                  ? "This is taking longer than expected. We'll update your wallet as soon as Paynow confirms."
                  : (started.instructions ??
                    `Approve the ${PAY_CHANNEL_LABELS[channel]} prompt to pay ${price}.`)}
          </Text>
          {action && started.reference && !settled && !showExit ? (
            <PaymentActionPanel action={action} reference={started.reference} />
          ) : null}
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      header={
        <ScreenHeader
          title="Agent subscription"
          subtitle={
            <Text variant="meta" color="neutral600">
              Needed to earn and cash out agent coins
            </Text>
          }
          onBack={onBack}
        />
      }
      footer={
        <View style={styles.footer}>
          {error ? (
            <Text variant="meta" color={colors.accent700} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          <Button
            label={pay.isPending ? 'Starting payment…' : `Pay ${price}`}
            block
            size="lg"
            arrow
            disabled={!subscription || pay.isPending}
            onPress={start}
          />
        </View>
      }
    >
      <View style={styles.section}>
        <Text variant="sectionLabel" style={styles.sectionLabel}>
          Summary
        </Text>
        <RuleList
          items={[
            { label: 'Plan', value: 'Agent subscription' },
            { label: 'Period', value: `${String(subscription?.cycleDays ?? 30)} days` },
            { label: 'Total', value: price },
          ]}
        />
        {subscription?.active && subscription.paidUntil ? (
          <Text variant="metaSmall" color="neutral600">
            Paying now adds to your current cover, which runs until{' '}
            {formatInHarare(subscription.paidUntil, 'd MMM yyyy')}.
          </Text>
        ) : null}
      </View>
      <View style={styles.section}>
        <Text variant="sectionLabel" style={styles.sectionLabel}>
          How you&apos;ll pay
        </Text>
        <OnlinePaymentFields
          channels={channels}
          channel={channel}
          onChannelChange={(next) => {
            setChosen(next);
            setPhoneError(null);
          }}
          phone={phone}
          onPhoneChange={(value) => {
            setPhone(value);
            setPhoneError(null);
          }}
          phoneError={phoneError}
        />
      </View>
    </Screen>
  );
}

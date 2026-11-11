import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import {
  formatUsd,
  MIN_FEE_PAYMENT_USD_CENTS,
  PAY_CHANNEL_LABELS,
  PHONE_PAY_CHANNELS,
  type PayChannel,
} from '@sc/shared';
import { space } from '@sc/tokens';
import {
  Button,
  RadioCard,
  RuleList,
  Screen,
  ScreenHeader,
  Text,
  TextField,
  useTheme,
} from '@sc/ui';
import { useFeeSummary, usePayFees } from '../../src/api/hooks/useFees.js';
import { useMe } from '../../src/api/hooks/useMe.js';
import { usePayChannels } from '../../src/api/hooks/usePayments.js';
import { OnlinePaymentFields, payerPhoneError } from '../../src/components/OnlinePaymentFields.js';
import { describeError } from '../../src/api/errorMessage.js';
import { useBack } from '../../src/navigation/useBack.js';
import { usePendingFeePaymentStore } from '../../src/state/index.js';

const styles = StyleSheet.create({
  footer: { gap: space.s },
  section: { marginBottom: space.xxl },
  sectionLabel: { marginBottom: space.m },
  amountField: { marginTop: space.l },
});

/** Turns "12.5" into 1250 cents, or null when it is not a positive amount. */
function parseDollars(input: string): number | null {
  const dollars = Number(input.trim());
  if (!Number.isFinite(dollars) || dollars <= 0) return null;
  return Math.round(dollars * 100);
}

/** Fee checkout lives outside `(provider)`, like the other payment screens live outside their tabs. */
export default function FeePayment() {
  const { colors } = useTheme();
  const onBack = useBack('/fees');
  const { data: summary } = useFeeSummary();
  const { data: me } = useMe();
  const payFees = usePayFees();
  const pending = usePendingFeePaymentStore((state) => state.pending);
  const setPending = usePendingFeePaymentStore((state) => state.setPending);
  const clearPending = usePendingFeePaymentStore((state) => state.clearPending);
  const [payerPhone, setPayerPhone] = useState('');
  const [partial, setPartial] = useState(false);
  const [amountInput, setAmountInput] = useState('');
  const [amountError, setAmountError] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [handingOff, setHandingOff] = useState(false);
  const [complete, setComplete] = useState(false);
  const { channels } = usePayChannels();
  const [chosenChannel, setChosenChannel] = useState<PayChannel>('ecocash');
  const payChannel = channels.includes(chosenChannel) ? chosenChannel : (channels[0] ?? 'ecocash');
  const balance = summary?.balanceUsdCents ?? 0;
  const minimum = Math.min(summary?.minPaymentUsdCents ?? MIN_FEE_PAYMENT_USD_CENTS, balance);

  useEffect(() => {
    if (me?.phone) setPayerPhone((current) => current || me.phone || '');
  }, [me?.phone]);

  if (handingOff && pending) return <Redirect href="/fees/paying" />;
  if (complete) return <Redirect href="/fees" />;

  const startPayment = () => {
    if (!summary || balance <= 0) return;
    let amountUsdCents = balance;
    if (partial) {
      const typed = parseDollars(amountInput);
      if (typed === null || typed < minimum || typed > balance) {
        setAmountError(
          typed !== null && typed > balance
            ? `You owe ${formatUsd(balance)}. Enter that or less.`
            : `Enter an amount from ${formatUsd(minimum)} to ${formatUsd(balance)}.`,
        );
        return;
      }
      amountUsdCents = typed;
    }
    setAmountError(null);
    const numberError = payerPhoneError(payChannel, payerPhone);
    if (numberError) {
      setPhoneError(numberError);
      return;
    }
    setPhoneError(null);
    setPaymentError(null);
    clearPending();
    payFees.mutate(
      {
        amountUsdCents,
        payChannel,
        ...(PHONE_PAY_CHANNELS.has(payChannel) ? { payerPhone: payerPhone.trim() } : {}),
      },
      {
        onSuccess: (result) => {
          if (result.pending) {
            setPending({
              amountUsdCents: result.amountUsdCents,
              ...(result.instructions ? { instructions: result.instructions } : {}),
              ...(result.checkoutUrl ? { checkoutUrl: result.checkoutUrl } : {}),
              ...(result.action ? { action: result.action } : {}),
              ...(result.reference ? { reference: result.reference } : {}),
              payChannel,
            });
            setHandingOff(true);
            return;
          }
          setComplete(true);
        },
        onError: (reason) =>
          setPaymentError(describeError(reason, "Couldn't take that payment. Try again.")),
      },
    );
  };

  const shown = partial ? (parseDollars(amountInput) ?? 0) : balance;

  return (
    <Screen
      header={
        <ScreenHeader
          title="Pay fees"
          subtitle={
            <Text variant="meta" color="neutral600">
              StylistsCenter fees
            </Text>
          }
          onBack={onBack}
        />
      }
      footer={
        <View style={styles.footer}>
          {paymentError ? (
            <Text
              variant="meta"
              color={colors.accent700}
              accessibilityLiveRegion="polite"
              accessibilityRole="alert"
            >
              {paymentError}
            </Text>
          ) : null}
          <Button
            label={
              payFees.isPending ? 'Starting payment…' : `Continue to Paynow — ${formatUsd(shown)}`
            }
            block
            size="lg"
            arrow
            disabled={!summary || balance <= 0 || payFees.isPending}
            onPress={startPayment}
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
            { label: 'You owe', value: formatUsd(Math.max(0, balance)) },
            { label: 'Paying now', value: formatUsd(shown) },
          ]}
        />
      </View>

      <View style={styles.section}>
        <Text variant="sectionLabel" style={styles.sectionLabel}>
          How much
        </Text>
        <RadioCard
          title={`Everything I owe — ${formatUsd(Math.max(0, balance))}`}
          dot
          selected={!partial}
          onPress={() => {
            setPartial(false);
            setAmountError(null);
          }}
        />
        <RadioCard
          title="A different amount"
          description={`Pay ${formatUsd(minimum)} or more, up to what you owe.`}
          dot
          selected={partial}
          onPress={() => {
            setPartial(true);
          }}
        />
        {partial ? (
          <View style={styles.amountField}>
            <TextField
              label="Amount (USD)"
              value={amountInput}
              onChangeText={(value) => {
                setAmountInput(value);
                setAmountError(null);
              }}
              keyboardType="decimal-pad"
              placeholder="0.00"
            />
            {amountError ? (
              <Text variant="meta" color={colors.accent700} accessibilityRole="alert">
                {amountError}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>

      <View style={styles.section}>
        <Text variant="sectionLabel" style={styles.sectionLabel}>
          How you&apos;ll pay
        </Text>
        <RadioCard
          title="Paynow — pay securely"
          description={`Pay with ${channels.map((c) => PAY_CHANNEL_LABELS[c]).join(', ')}. Your fees only go down after Paynow confirms the payment.`}
          dot
          selected
          onPress={() => undefined}
        />
        <OnlinePaymentFields
          channels={channels}
          channel={payChannel}
          onChannelChange={(next) => {
            setChosenChannel(next);
            setPhoneError(null);
          }}
          phone={payerPhone}
          onPhoneChange={(value) => {
            setPayerPhone(value);
            setPhoneError(null);
          }}
          phoneError={phoneError}
        />
      </View>
    </Screen>
  );
}

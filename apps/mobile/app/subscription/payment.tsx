import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { formatUsd, isValidMobileMoneyPhone } from '@sc/shared';
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
import { usePaySubscription, useProviderSubscription } from '../../src/api/hooks/useProviders.js';
import { useMe } from '../../src/api/hooks/useMe.js';
import { describeError } from '../../src/api/errorMessage.js';
import { useBack } from '../../src/navigation/useBack.js';
import { usePendingSubscriptionStore } from '../../src/state/index.js';

const styles = StyleSheet.create({
  footer: { gap: space.s },
  section: { marginBottom: space.xxl },
  sectionLabel: { marginBottom: space.m },
  phoneField: { marginTop: space.l },
  phoneHelp: { marginTop: space.s },
});

/** Subscription checkout lives outside `(provider)`, exactly like client booking checkout lives outside `(tabs)`. */
export default function SubscriptionPayment() {
  const { colors } = useTheme();
  const onBack = useBack('/(provider)/profile');
  const { data: subscription } = useProviderSubscription();
  const { data: me } = useMe();
  const paySubscription = usePaySubscription();
  const pending = usePendingSubscriptionStore((state) => state.pending);
  const setPending = usePendingSubscriptionStore((state) => state.setPending);
  const clearPending = usePendingSubscriptionStore((state) => state.clearPending);
  const [payerPhone, setPayerPhone] = useState('');
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [handingOff, setHandingOff] = useState(false);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    if (me?.phone) setPayerPhone((current) => current || me.phone || '');
  }, [me?.phone]);

  if (handingOff && pending) return <Redirect href="/subscription/paying" />;
  if (complete) return <Redirect href="/(provider)/profile" />;

  const startPayment = () => {
    if (!subscription) return;
    if (!isValidMobileMoneyPhone(payerPhone.trim())) {
      setPhoneError('Enter a valid mobile number, for example 077 000 0000.');
      return;
    }
    setPhoneError(null);
    setPaymentError(null);
    clearPending();
    paySubscription.mutate(
      { paymentMethod: 'ecocash', payerPhone: payerPhone.trim() },
      {
        onSuccess: (result) => {
          if (result.pending) {
            setPending({
              priceUsdCents: subscription.priceUsdCents,
              ...(result.instructions ? { instructions: result.instructions } : {}),
              ...(result.checkoutUrl ? { checkoutUrl: result.checkoutUrl } : {}),
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

  return (
    <Screen
      header={
        <ScreenHeader
          title="Payment"
          subtitle={
            <Text variant="meta" color="neutral600">
              Monthly subscription
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
              paySubscription.isPending
                ? 'Starting payment…'
                : `Continue to Paynow — ${formatUsd(subscription?.priceUsdCents ?? 0)}`
            }
            block
            size="lg"
            arrow
            disabled={!subscription || paySubscription.isPending}
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
            { label: 'Plan', value: 'Style Center partner' },
            { label: 'Period', value: '30 days' },
            { label: 'Total', value: formatUsd(subscription?.priceUsdCents ?? 0) },
          ]}
        />
      </View>

      <View style={styles.section}>
        <Text variant="sectionLabel" style={styles.sectionLabel}>
          How you&apos;ll pay
        </Text>
        <RadioCard
          title="Paynow — pay securely"
          description="Pay by EcoCash. We activate your subscription only after Paynow verifies it."
          dot
          selected
          onPress={() => undefined}
        />
        <View style={styles.phoneField}>
          <TextField
            label="EcoCash number"
            value={payerPhone}
            onChangeText={(value) => {
              setPayerPhone(value);
              setPhoneError(null);
            }}
            placeholder="077 000 0000"
            keyboardType="phone-pad"
          />
          <Text
            variant="metaSmall"
            color={phoneError ? colors.accent700 : 'neutral600'}
            style={styles.phoneHelp}
            {...(phoneError ? { accessibilityLiveRegion: 'polite' as const } : {})}
          >
            {phoneError ??
              "We'll send the payment prompt here. It doesn't have to be your login number."}
          </Text>
        </View>
      </View>
    </Screen>
  );
}

import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { space } from '@sc/tokens';
import { formatUsd, isValidMobileMoneyPhone } from '@sc/shared';
import {
  Screen,
  ScreenHeader,
  Text,
  RadioCard,
  RuleList,
  Button,
  TextField,
  useTheme,
} from '@sc/ui';
import { useProvider } from '../../src/api/hooks/useProviders.js';
import { useCreateBooking } from '../../src/api/hooks/useBookings.js';
import { useMe } from '../../src/api/hooks/useMe.js';
import { useBookingDraftStore, usePendingPaymentStore } from '../../src/state/index.js';
import { useBack } from '../../src/navigation/useBack.js';
import { formatSlotLabel, isoFromHarareSlot } from '../../src/utils/bookingWhen.js';
import { describeError } from '../../src/api/errorMessage.js';
import { TimeoutError } from '../../src/api/errors.js';

const styles = StyleSheet.create({
  footer: { gap: space.s },
  section: { marginBottom: space.xxl },
  sectionLabel: { marginBottom: space.m },
  radioGap: { marginBottom: space.s },
  phoneField: { marginTop: space.l },
  phoneHelp: { marginTop: space.s },
});

/** Payment (handoff screen 7, Step 2/2). */
export default function Payment() {
  const { colors } = useTheme();
  const onBack = useBack('/book/slot');
  const providerId = useBookingDraftStore((s) => s.providerId);
  const serviceId = useBookingDraftStore((s) => s.serviceId);
  const date = useBookingDraftStore((s) => s.date);
  const time = useBookingDraftStore((s) => s.time);
  const matchId = useBookingDraftStore((s) => s.matchId);
  const paymentMethod = useBookingDraftStore((s) => s.paymentMethod);
  const setPaymentMethod = useBookingDraftStore((s) => s.setPaymentMethod);
  const resetDraft = useBookingDraftStore((s) => s.reset);
  const setPendingPayment = usePendingPaymentStore((s) => s.setPending);
  const clearPendingPayment = usePendingPaymentStore((s) => s.clearPending);
  const pendingPayment = usePendingPaymentStore((s) => s.pending);
  const createBooking = useCreateBooking();
  const [bookingError, setBookingError] = useState<string | null>(null);
  const { data: me } = useMe();
  const [payerPhone, setPayerPhone] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [doneParams, setDoneParams] = useState<Record<string, string> | null>(null);
  /**
   * Only ever set by a checkout started on this visit.
   *
   * Without it, a pending payment left in the store by an earlier attempt made
   * this screen redirect to the waiting screen the moment it mounted — so
   * "Continue to payment" appeared to open Paynow's website by itself, before
   * the user had chosen anything.
   */
  const [handingOff, setHandingOff] = useState(false);

  // Prefilled with the account number as the common case, still editable —
  // the line someone pays from is not necessarily the one they log in with.
  useEffect(() => {
    if (me?.phone) {
      const phone = me.phone;
      setPayerPhone((current) => current || phone);
    }
  }, [me?.phone]);

  const { data: provider } = useProvider(providerId ?? undefined);
  const service = provider?.services.find((s) => s.id === serviceId) ?? null;

  /**
   * Set the moment a booking succeeds and this screen starts navigating on.
   *
   * Confirming clears the draft, which empties exactly the values the
   * cold-start guard below watches — so without this the guard fired on the
   * next render and `replace`d the route we had just navigated to, dumping
   * the user on the home tab instead of the payment-status screen. The guard
   * is for arriving here with no draft, not for leaving here having used it.
   */
  const leavingRef = useRef(false);

  // Cold-start / deep-link guard — this screen only makes sense with a
  // provider, service, and slot already chosen.
  useEffect(() => {
    if (leavingRef.current) return;
    if (!providerId || !serviceId || !date || !time) {
      router.replace('/(tabs)');
    }
  }, [providerId, serviceId, date, time]);

  /**
   * Hand off to the payment-status screen once a checkout exists.
   *
   * Driven by state rather than called inside the mutation callback: a
   * `router.replace` issued from within `onSuccess` was being dropped
   * outright — the booking was created and the prompt sent, but the app
   * stayed put and the user was left on the home tab with nothing polling.
   * An effect runs after the commit, when the navigator is settled.
   */
  useEffect(() => {
    if (!handingOff && !doneParams) return;
    leavingRef.current = true;
    resetDraft();
  }, [handingOff, doneParams, resetDraft]);

  // Declarative, not imperative. `router.replace`/`router.push` called from
  // here were dispatched and then silently dropped — the screen never
  // mounted, no error was raised, and the user was left on the home tab with
  // a booking made, a prompt sent, and nothing polling the payment.
  // <Redirect> hands the navigation to the mounted navigator instead.
  if (handingOff && pendingPayment) return <Redirect href="/book/paying" />;
  if (doneParams) return <Redirect href={{ pathname: '/book/done', params: doneParams }} />;

  if (!providerId || !serviceId || !date || !time || !provider || !service) return null;

  const whenLabel = formatSlotLabel(date, time);

  const confirmBooking = () => {
    setBookingError(null);
    // Catch a bad number here rather than letting the server reject the whole
    // booking for it — the slot and service are fine, only this field isn't.
    if (paymentMethod === 'ecocash' && !isValidMobileMoneyPhone(payerPhone.trim())) {
      setPhoneError('Enter a valid mobile number, for example 077 000 0000.');
      return;
    }
    setPhoneError(null);
    // A previous attempt's payment must not make the effect below fire on the
    // stale one the moment this screen mounts.
    clearPendingPayment();
    createBooking.mutate(
      {
        providerId: provider.id,
        serviceId: service.id,
        startsAt: isoFromHarareSlot(date, time),
        paymentMethod,
        ...(matchId ? { matchId } : {}),
        ...(paymentMethod === 'ecocash' ? { payerPhone: payerPhone.trim() } : {}),
      },
      {
        onSuccess: (created) => {
          leavingRef.current = true;
          const doneParams = {
            reference: created.reference,
            providerId: provider.id,
            providerName: provider.displayName,
            serviceName: service.name,
            whenLabel,
            areaName: provider.areaName,
          };
          // Paynow is in play — either an EcoCash prompt on the client's phone
          // or its hosted page. Both hand off to the waiting screen, which owns
          // the verdict: a closed browser is not a confirmed payment, and this
          // screen must never declare the booking done before Paynow has said so.
          //
          // The context goes through a store rather than route params: as URL
          // params it was arriving empty, and the waiting screen's guard then
          // sent the user to the home tab with the booking unpaid and nothing
          // polling it.
          if (created.instructions || created.checkoutUrl) {
            setPendingPayment({
              bookingId: created.id,
              reference: created.reference,
              providerId: provider.id,
              providerName: provider.displayName,
              serviceName: service.name,
              whenLabel,
              areaName: provider.areaName,
              ...(created.instructions ? { instructions: created.instructions } : {}),
              ...(created.checkoutUrl ? { checkoutUrl: created.checkoutUrl } : {}),
            });
            setHandingOff(true);
            return;
          }
          // Cash: nothing to wait on, but the handoff still goes through a
          // <Redirect> below rather than router.replace — imperative
          // navigation from this screen is dropped, which left a confirmed
          // cash booking dumping the user on the home tab.
          setDoneParams({
            ...doneParams,
            paymentLabel: 'Cash — pay in person',
          });
        },
        onError: (error) => {
          /**
           * A timeout is not a failure — the request may well have been
           * applied. It routinely is: the API answers this in ~1s, but a
           * response lost on a mobile network still trips the client
           * deadline, and the booking exists server-side with an EcoCash
           * prompt already sent. Leaving the user here invites them to tap
           * again and double-book, and strands the payment with nothing
           * watching it. Send them to Bookings, which re-fetches from the
           * server and shows whichever bookings actually exist.
           */
          if (error instanceof TimeoutError) {
            leavingRef.current = true;
            resetDraft();
            router.replace('/(tabs)/bookings');
            return;
          }
          setBookingError(describeError(error, "Couldn't confirm that booking. Try again."));
        },
      },
    );
  };

  const ctaLabel = createBooking.isPending
    ? 'Booking…'
    : paymentMethod === 'ecocash'
      ? `Continue to Paynow — ${formatUsd(service.priceUsdCents)}`
      : 'Request booking — pay cash';

  return (
    <Screen
      header={
        <ScreenHeader
          title="Payment"
          subtitle={
            <Text variant="meta" color="neutral600">
              Step 2 of 2
            </Text>
          }
          onBack={onBack}
        />
      }
      footer={
        <View style={styles.footer}>
          {/* The realistic failure here is losing the slot to someone else
              between picking it and confirming — a race this screen cannot
              prevent, only report. It was previously invisible: the tap did
              nothing and the user tapped again. */}
          {bookingError ? (
            <Text
              variant="meta"
              color={colors.accent700}
              accessibilityLiveRegion="polite"
              accessibilityRole="alert"
            >
              {bookingError}
            </Text>
          ) : null}
          <Button
            label={ctaLabel}
            block
            size="lg"
            arrow
            disabled={createBooking.isPending}
            onPress={confirmBooking}
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
            { label: 'Stylist', value: provider.displayName },
            { label: 'Service', value: service.name },
            { label: 'When', value: whenLabel },
            { label: 'Total', value: formatUsd(service.priceUsdCents) },
          ]}
        />
      </View>

      <View style={styles.section}>
        <Text variant="sectionLabel" style={styles.sectionLabel}>
          How you&apos;ll pay
        </Text>
        <View style={styles.radioGap}>
          <RadioCard
            title="Paynow — pay securely"
            description="Choose EcoCash, card, or another supported Paynow method. We record payment only after Paynow verifies it."
            dot
            selected={paymentMethod === 'ecocash'}
            onPress={() => {
              setPaymentMethod('ecocash');
            }}
          />
        </View>
        <RadioCard
          title="Cash — settle with the stylist"
          description="You both confirm in the app afterwards, so the booking counts and no one is marked a no-show."
          dot
          selected={paymentMethod === 'cash'}
          onPress={() => {
            setPaymentMethod('cash');
          }}
        />

        {paymentMethod === 'ecocash' ? (
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
        ) : null}
      </View>
    </Screen>
  );
}

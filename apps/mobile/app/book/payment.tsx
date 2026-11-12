import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { space } from '@sc/tokens';
import { formatUsd } from '@sc/shared';
import { Screen, ScreenHeader, Text, RadioCard, RuleList, Button, useTheme } from '@sc/ui';
import { useProvider } from '../../src/api/hooks/useProviders.js';
import { useCreateBooking } from '../../src/api/hooks/useBookings.js';
import { useAppConfig } from '../../src/api/hooks/useAppConfig.js';
import { useWallet } from '../../src/api/hooks/useWallet.js';
import { useBookingDraftStore } from '../../src/state/index.js';
import { useBack } from '../../src/navigation/useBack.js';
import { formatSlotLabel, isoFromHarareSlot } from '../../src/utils/bookingWhen.js';
import { clientPrice, coinsToApply } from '../../src/utils/bookingPrice.js';
import { describeError } from '../../src/api/errorMessage.js';
import { TimeoutError } from '../../src/api/errors.js';

const styles = StyleSheet.create({
  footer: { gap: space.s },
  section: { marginBottom: space.xxl },
  sectionLabel: { marginBottom: space.m },
  radioGap: { marginBottom: space.s },
});

/**
 * Review and confirm (Step 2/2). Nothing is paid in the app: the client pays
 * the stylist directly after the appointment, so this screen only shows
 * what they will owe and lets them put coins towards it.
 */
export default function Payment() {
  const { colors } = useTheme();
  const onBack = useBack('/book/slot');
  const providerId = useBookingDraftStore((s) => s.providerId);
  const serviceId = useBookingDraftStore((s) => s.serviceId);
  const date = useBookingDraftStore((s) => s.date);
  const time = useBookingDraftStore((s) => s.time);
  const matchId = useBookingDraftStore((s) => s.matchId);
  const resetDraft = useBookingDraftStore((s) => s.reset);
  const createBooking = useCreateBooking();
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [doneParams, setDoneParams] = useState<Record<string, string> | null>(null);
  const [useCoins, setUseCoins] = useState(false);
  const { serviceFeeBps, serviceFeePaidBy } = useAppConfig();
  const { data: wallet } = useWallet();

  const { data: provider } = useProvider(providerId ?? undefined);
  const service = provider?.services.find((s) => s.id === serviceId) ?? null;

  /**
   * Set the moment a booking succeeds and this screen starts navigating on.
   *
   * Confirming clears the draft, which empties exactly the values the
   * cold-start guard below watches — so without this the guard fired on the
   * next render and `replace`d the route we had just navigated to, dumping
   * the user on the home tab instead of the Booked screen. The guard is for
   * arriving here with no draft, not for leaving here having used it.
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

  useEffect(() => {
    if (!doneParams) return;
    leavingRef.current = true;
    resetDraft();
  }, [doneParams, resetDraft]);

  // Declarative, not imperative: `router.replace` called from here was
  // dispatched and then silently dropped, leaving a booking made and the user
  // on the home tab. <Redirect> hands the navigation to the mounted navigator.
  if (doneParams) return <Redirect href={{ pathname: '/book/done', params: doneParams }} />;

  if (!providerId || !serviceId || !date || !time || !provider || !service) return null;

  const whenLabel = formatSlotLabel(date, time);
  const { feeUsdCents, totalUsdCents } = clientPrice(
    service.priceUsdCents,
    serviceFeeBps,
    serviceFeePaidBy,
  );
  const coinUsdCents = wallet?.coinUsdCents ?? 0;
  const coins = useCoins ? coinsToApply(wallet?.coins ?? 0, totalUsdCents, coinUsdCents) : 0;
  const coinsValueUsdCents = coins * coinUsdCents;
  const dueUsdCents = totalUsdCents - coinsValueUsdCents;
  const offerableCoins = coinsToApply(wallet?.coins ?? 0, totalUsdCents, coinUsdCents);

  const confirmBooking = () => {
    setBookingError(null);
    createBooking.mutate(
      {
        providerId: provider.id,
        serviceId: service.id,
        startsAt: isoFromHarareSlot(date, time),
        ...(matchId ? { matchId } : {}),
        ...(coins > 0 ? { coins } : {}),
      },
      {
        onSuccess: (created) => {
          leavingRef.current = true;
          setDoneParams({
            reference: created.reference,
            providerId: provider.id,
            providerName: provider.displayName,
            serviceName: service.name,
            whenLabel,
            areaName: provider.areaName,
            paymentLabel: `Pay the stylist directly — ${formatUsd(dueUsdCents)}`,
          });
        },
        onError: (error) => {
          /**
           * A timeout is not a failure — the request may well have been
           * applied: the API answers this in ~1s, but a response lost on a
           * mobile network still trips the client deadline, and the booking
           * exists server-side. Leaving the user here invites them to tap
           * again and double-book. Send them to Bookings, which re-fetches
           * from the server and shows whichever bookings actually exist.
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

  const ctaLabel = createBooking.isPending ? 'Booking…' : 'Request booking';

  return (
    <Screen
      header={
        <ScreenHeader
          title="Confirm booking"
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
            { label: 'Stylist price', value: formatUsd(service.priceUsdCents) },
            ...(feeUsdCents > 0 ? [{ label: 'Service fee', value: formatUsd(feeUsdCents) }] : []),
            { label: 'Total', value: formatUsd(totalUsdCents) },
            ...(coins > 0
              ? [{ label: `${String(coins)} coins`, value: `−${formatUsd(coinsValueUsdCents)}` }]
              : []),
            { label: 'You pay the stylist', value: formatUsd(dueUsdCents) },
          ]}
        />
      </View>

      <View style={styles.section}>
        <Text variant="sectionLabel" style={styles.sectionLabel}>
          How you pay
        </Text>
        <Text variant="body" color="neutral700">
          You pay {provider.displayName} directly, in cash or to their mobile money number, after
          your appointment. Nothing is taken in the app. Once the stylist accepts, their number is
          shown on your booking.
        </Text>
      </View>

      {offerableCoins > 0 ? (
        <View style={styles.section}>
          <Text variant="sectionLabel" style={styles.sectionLabel}>
            Coins
          </Text>
          <View style={styles.radioGap}>
            <RadioCard
              title="Don't use coins"
              description="Keep your coins for another time."
              dot
              selected={!useCoins}
              onPress={() => {
                setUseCoins(false);
              }}
            />
          </View>
          <RadioCard
            title={`Use ${String(offerableCoins)} coins`}
            description={`Takes ${formatUsd(offerableCoins * coinUsdCents)} off what you pay. The coins go to your stylist.`}
            dot
            selected={useCoins}
            onPress={() => {
              setUseCoins(true);
            }}
          />
        </View>
      ) : null}
    </Screen>
  );
}

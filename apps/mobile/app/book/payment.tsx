import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { color, space } from '@sc/tokens';
import { formatUsd } from '@sc/shared';
import { Screen, ScreenHeader, Text, RadioCard, RuleList, Button } from '@sc/ui';
import { useProvider } from '../../src/api/hooks/useProviders.js';
import { useCreateBooking } from '../../src/api/hooks/useBookings.js';
import { useBookingDraftStore } from '../../src/state/index.js';
import { useBack } from '../../src/navigation/useBack.js';
import { formatSlotLabel, isoFromHarareSlot } from '../../src/utils/bookingWhen.js';

const styles = StyleSheet.create({
  section: { marginBottom: space.xxl },
  sectionLabel: { marginBottom: space.m },
  radioGap: { marginBottom: space.s },
  ecocashPanel: {
    marginTop: space.s,
    padding: space.l,
    borderRadius: 20,
    backgroundColor: color.surface,
    gap: 2,
  },
});

/** Payment (handoff screen 7, Step 2/2). */
export default function Payment() {
  const onBack = useBack('/book/slot');
  const providerId = useBookingDraftStore((s) => s.providerId);
  const serviceId = useBookingDraftStore((s) => s.serviceId);
  const date = useBookingDraftStore((s) => s.date);
  const time = useBookingDraftStore((s) => s.time);
  const matchId = useBookingDraftStore((s) => s.matchId);
  const paymentMethod = useBookingDraftStore((s) => s.paymentMethod);
  const setPaymentMethod = useBookingDraftStore((s) => s.setPaymentMethod);
  const resetDraft = useBookingDraftStore((s) => s.reset);
  const createBooking = useCreateBooking();

  const { data: provider } = useProvider(providerId ?? undefined);
  const service = provider?.services.find((s) => s.id === serviceId) ?? null;

  // Cold-start / deep-link guard — this screen only makes sense with a
  // provider, service, and slot already chosen.
  useEffect(() => {
    if (!providerId || !serviceId || !date || !time) {
      router.replace('/(tabs)');
    }
  }, [providerId, serviceId, date, time]);

  if (!providerId || !serviceId || !date || !time || !provider || !service) return null;

  const whenLabel = formatSlotLabel(date, time);

  const confirmBooking = () => {
    createBooking.mutate(
      {
        providerId: provider.id,
        serviceId: service.id,
        startsAt: isoFromHarareSlot(date, time),
        paymentMethod,
        ...(matchId ? { matchId } : {}),
      },
      {
        onSuccess: (created) => {
          resetDraft();
          router.replace({
            pathname: '/book/done',
            params: {
              reference: created.reference,
              providerId: provider.id,
              providerName: provider.displayName,
              serviceName: service.name,
              whenLabel,
              areaName: provider.areaName,
              paymentLabel:
                paymentMethod === 'ecocash' ? 'EcoCash — held in escrow' : 'Cash — pay in person',
            },
          });
        },
      },
    );
  };

  const ctaLabel = createBooking.isPending
    ? 'Booking…'
    : paymentMethod === 'ecocash'
      ? `Pay ${formatUsd(service.priceUsdCents)} with EcoCash`
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
        <Button
          label={ctaLabel}
          block
          size="lg"
          arrow
          disabled={createBooking.isPending}
          onPress={confirmBooking}
        />
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
            title="EcoCash — pay in app"
            description="Held until the appointment is marked complete. Refunded if she cancels."
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
          <View style={styles.ecocashPanel}>
            <Text variant="meta" color="neutral600">
              +263 77 000 0000 (read-only for now — Phase 3 wires this to your account)
            </Text>
            <Text variant="meta" color="neutral700">
              You&apos;ll get a prompt on your phone.
            </Text>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

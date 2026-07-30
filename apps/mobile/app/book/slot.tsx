import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { space } from '@sc/tokens';
import { formatInHarare, formatUsd } from '@sc/shared';
import { Screen, ScreenHeader, Text, RadioCard, DateStrip, TimeGrid, Button } from '@sc/ui';
import type { DateStripItem } from '@sc/ui';
import { useProvider, useProviderSlots } from '../../src/api/hooks/useProviders.js';
import { useBookingDraftStore } from '../../src/state/index.js';
import { useBack } from '../../src/navigation/useBack.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function buildDateStrip(): DateStripItem[] {
  const now = Date.now();
  return Array.from({ length: 4 }, (_, i) => {
    const iso = new Date(now + i * DAY_MS).toISOString();
    return {
      value: formatInHarare(iso, 'yyyy-MM-dd'),
      dow: formatInHarare(iso, 'EEE').toUpperCase(),
      day: formatInHarare(iso, 'd'),
    };
  });
}

const styles = StyleSheet.create({
  section: { marginBottom: space.xxl },
  sectionLabel: { marginBottom: space.m },
  note: { marginTop: space.m },
  footerSummary: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: space.ml },
});

/** Choose a slot (handoff screen 6, Step 1/2). */
export default function ChooseSlot() {
  const onBack = useBack('/(tabs)');
  const providerId = useBookingDraftStore((s) => s.providerId);
  const serviceId = useBookingDraftStore((s) => s.serviceId);
  const setService = useBookingDraftStore((s) => s.setService);
  const setSlot = useBookingDraftStore((s) => s.setSlot);

  const { data: provider } = useProvider(providerId ?? undefined);
  const dates = useMemo(buildDateStrip, []);
  const [date, setDate] = useState(dates[0]?.value ?? '');
  const [time, setTime] = useState<string | null>(null);
  const { data: slotsResponse } = useProviderSlots(providerId ?? undefined, date);

  // Cold-start / deep-link guard — this screen only makes sense once a
  // provider has been chosen (Provider profile's BOOK button).
  useEffect(() => {
    if (!providerId) {
      router.replace('/(tabs)');
    }
  }, [providerId]);

  if (!providerId) return null;

  const selectedService = provider?.services.find((s) => s.id === serviceId) ?? null;
  const canContinue = !!serviceId && !!time;

  const chooseDate = (value: string) => {
    setDate(value);
    setTime(null);
  };

  const chooseTime = (value: string) => {
    setTime(value);
    setSlot(date, value);
  };

  const continueToPayment = () => {
    if (!canContinue) return;
    router.push('/book/payment');
  };

  return (
    <Screen
      header={<ScreenHeader title="Choose a slot" subtitle={<Text variant="meta" color="neutral600">Step 1 of 2</Text>} onBack={onBack} />}
      footer={
        <View>
          <View style={styles.footerSummary}>
            <Text variant="body" color="neutral700">
              {selectedService?.name ?? 'Choose a service'}
            </Text>
            <Text variant="h3">{selectedService ? formatUsd(selectedService.priceUsdCents) : '—'}</Text>
          </View>
          <Button
            label="Continue to payment"
            block
            size="lg"
            arrow
            disabled={!canContinue}
            onPress={continueToPayment}
          />
        </View>
      }
    >
      <View style={styles.section}>
        <Text variant="sectionLabel" style={styles.sectionLabel}>
          Service
        </Text>
        {provider?.services.map((service) => (
          <RadioCard
            key={service.id}
            title={service.name}
            description={`${String(service.durationMinutes)} min · ${formatUsd(service.priceUsdCents)}`}
            selected={service.id === serviceId}
            onPress={() => {
              setService(service.id);
            }}
          />
        ))}
      </View>

      <View style={styles.section}>
        <Text variant="sectionLabel" style={styles.sectionLabel}>
          Date
        </Text>
        <DateStrip dates={dates} value={date} onChange={chooseDate} />
      </View>

      <View style={styles.section}>
        <Text variant="sectionLabel" style={styles.sectionLabel}>
          Time
        </Text>
        <TimeGrid slots={slotsResponse?.slots ?? []} value={time} onChange={chooseTime} />
        <Text variant="meta" color="neutral600" style={styles.note}>
          Greyed slots are already taken. {provider?.displayName ?? 'The stylist'} confirms or declines
          within the hour.
        </Text>
      </View>
    </Screen>
  );
}

import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { color, space } from '@sc/tokens';
import {
  BUDGET_MAX_USD,
  BUDGET_MIN_USD,
  BUDGET_STEP_USD,
  MATCH_REQUEST_TTL_SECONDS,
  MAX_MATCH_RADIUS_KM,
  MIN_MATCH_RADIUS_KM,
} from '@sc/shared';
import { Screen, ScreenHeader, Text, Chip, SegmentedPills, RangeInput, Button } from '@sc/ui';
import { useCategories } from '../../src/api/hooks/useCategories.js';
import { useCreateMatch } from '../../src/api/hooks/useMatching.js';
import { useRequestStore } from '../../src/state/index.js';
import { useDebouncedValue } from '../../src/hooks/useDebouncedValue.js';
import { describeError } from '../../src/api/errorMessage.js';
import { useBack } from '../../src/navigation/useBack.js';

const BUDGET_MODE_OPTIONS = [
  { value: 'flex' as const, label: 'Flexible' },
  { value: 'fixed' as const, label: 'Set an amount' },
];

const styles = StyleSheet.create({
  section: { marginBottom: space.xxl },
  sectionLabelSpace: { marginBottom: space.s },
  radiusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: space.s,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  amountPanel: {
    borderWidth: 1,
    borderColor: color.divider,
    borderRadius: 20,
    padding: space.l,
    marginTop: space.m,
  },
  amountHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: space.s,
  },
  footer: { gap: space.s },
  summary: { borderTopWidth: 1, borderTopColor: color.divider, paddingTop: space.ml },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
});

export default function NewRequest() {
  const onBack = useBack('/(tabs)');
  const categoryId = useRequestStore((s) => s.categoryId);
  const budget = useRequestStore((s) => s.budget);
  const radiusKm = useRequestStore((s) => s.radiusKm);
  const setCategory = useRequestStore((s) => s.setCategory);
  const setBudget = useRequestStore((s) => s.setBudget);
  const setRadiusKm = useRequestStore((s) => s.setRadiusKm);
  const setMatchId = useRequestStore((s) => s.setMatchId);
  const { data: categories } = useCategories(radiusKm);
  const createMatch = useCreateMatch();

  const [amount, setAmount] = useState(50);
  const [sendError, setSendError] = useState<string | null>(null);
  const inRange = categories?.find((c) => c.id === categoryId)?.nearbyCount ?? 0;

  // Same local-value-plus-debounce pattern as the Find/Market distance slider
  // (DistanceFilter): `radiusKm` drives the live "stylists in range" query, so
  // committing on every native slider tick would fire a request per pixel of
  // drag. Only the debounced value is written back to the store.
  const [liveRadius, setLiveRadius] = useState(radiusKm);
  useEffect(() => {
    setLiveRadius(radiusKm);
  }, [radiusKm]);
  const debouncedRadius = useDebouncedValue(liveRadius, 400);
  useEffect(() => {
    if (debouncedRadius !== radiusKm) setRadiusKm(debouncedRadius);
  }, [debouncedRadius, radiusKm, setRadiusKm]);

  // Sending to nobody produces a request that can only ever expire. The
  // radius picker directly above is the fix, so the button says so instead of
  // accepting a tap that is guaranteed to waste five minutes.
  const canSend = !!categoryId && inRange > 0 && !createMatch.isPending;
  const expiryMinutes = Math.round(MATCH_REQUEST_TTL_SECONDS / 60);

  const sendLabel = createMatch.isPending
    ? 'Sending…'
    : !categoryId
      ? 'Pick a service'
      : inRange === 0
        ? 'No stylists in range'
        : `Send to ${String(inRange)} ${inRange === 1 ? 'stylist' : 'stylists'}`;

  const setBudgetMode = (mode: 'flex' | 'fixed') => {
    setBudget(mode === 'flex' ? { mode: 'flex' } : { mode: 'fixed', amountUsd: amount });
  };

  const onAmountChange = (value: number) => {
    setAmount(value);
    if (budget.mode === 'fixed') setBudget({ mode: 'fixed', amountUsd: value });
  };

  const sendRequest = () => {
    if (!canSend) return;
    setSendError(null);
    createMatch.mutate(
      { categoryId, budget, radiusKm },
      {
        onSuccess: (created) => {
          setMatchId(created.id);
          router.push('/request/searching');
        },
        // Without this a failed request left the button re-enabled and the
        // screen unchanged, which reads as "nothing happened" — the user
        // taps again and the same silent failure repeats.
        onError: (error) => {
          setSendError(describeError(error, "Couldn't send your request. Try again."));
        },
      },
    );
  };

  return (
    <Screen
      header={<ScreenHeader title="New request" onBack={onBack} />}
      footer={
        <View style={styles.footer}>
          {sendError ? (
            <Text
              variant="meta"
              color={color.accent700}
              accessibilityLiveRegion="polite"
              accessibilityRole="alert"
            >
              {sendError}
            </Text>
          ) : null}
          <Button
            label={sendLabel}
            onPress={sendRequest}
            block
            size="lg"
            disabled={!canSend}
            arrow
          />
        </View>
      }
    >
      <View style={styles.section}>
        <Text variant="sectionLabel" style={styles.sectionLabelSpace}>
          Service
        </Text>
        <View style={styles.chipRow}>
          {categories?.map((c) => (
            <Chip
              key={c.id}
              label={c.name}
              selected={c.id === categoryId}
              onPress={() => {
                setCategory(c.id);
              }}
            />
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text variant="sectionLabel" style={styles.sectionLabelSpace}>
          Budget
        </Text>
        <SegmentedPills
          options={BUDGET_MODE_OPTIONS}
          value={budget.mode}
          onChange={setBudgetMode}
        />
        {budget.mode === 'fixed' ? (
          <View style={styles.amountPanel}>
            <View style={styles.amountHeader}>
              <Text variant="kicker" color="neutral700">
                Up to
              </Text>
              <Text variant="h3">${amount}</Text>
            </View>
            <RangeInput
              min={BUDGET_MIN_USD}
              max={BUDGET_MAX_USD}
              step={BUDGET_STEP_USD}
              value={amount}
              onChange={onAmountChange}
              accessibilityLabel="Budget amount"
            />
          </View>
        ) : null}
      </View>

      <View style={styles.section}>
        <View style={styles.radiusHeader}>
          <Text variant="sectionLabel">Search radius</Text>
          <Text variant="bodyStrong">{Math.round(liveRadius)} km</Text>
        </View>
        <RangeInput
          min={MIN_MATCH_RADIUS_KM}
          max={MAX_MATCH_RADIUS_KM}
          step={1}
          value={liveRadius}
          onChange={setLiveRadius}
          accessibilityLabel="Search radius"
        />
      </View>

      <View style={styles.summary}>
        <View style={styles.summaryRow}>
          <Text variant="body" color="neutral700">
            Stylists in range
          </Text>
          <Text variant="bodyStrong">{inRange}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text variant="body" color="neutral700">
            Request expires in
          </Text>
          <Text variant="bodyStrong">
            {expiryMinutes} {expiryMinutes === 1 ? 'minute' : 'minutes'}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Text variant="body" color="neutral700">
            You pay
          </Text>
          <Text variant="bodyStrong">nothing to ask</Text>
        </View>
      </View>
    </Screen>
  );
}

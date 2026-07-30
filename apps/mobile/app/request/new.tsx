import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { color, space } from '@sc/tokens';
import {
  BUDGET_MAX_USD,
  BUDGET_MIN_USD,
  BUDGET_STEP_USD,
  MATCH_REQUEST_TTL_SECONDS,
  PLACEHOLDER_IN_RANGE_COUNT,
  RADIUS_LADDER_KM,
  type RadiusKm,
} from '@sc/shared';
import {
  Screen,
  ScreenHeader,
  Text,
  Chip,
  SegmentedPills,
  RangeInput,
  Button,
} from '@sc/ui';
import { useCategories } from '../../src/api/hooks/useCategories.js';
import { useRequestStore } from '../../src/state/index.js';
import { useBack } from '../../src/navigation/useBack.js';

const RADIUS_OPTIONS = RADIUS_LADDER_KM.map((km) => ({ value: km, label: `${String(km)} km` }));
const BUDGET_MODE_OPTIONS = [
  { value: 'flex' as const, label: 'Flexible' },
  { value: 'fixed' as const, label: 'Set an amount' },
];

const styles = StyleSheet.create({
  section: { marginBottom: space.xxl },
  sectionLabelSpace: { marginBottom: space.s },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  amountPanel: {
    borderWidth: 1,
    borderColor: color.divider,
    borderRadius: 20,
    padding: space.l,
    marginTop: space.m,
  },
  amountHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: space.s },
  summary: { borderTopWidth: 1, borderTopColor: color.divider, paddingTop: space.ml },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
});

export default function NewRequest() {
  const onBack = useBack('/(tabs)');
  const { data: categories } = useCategories();
  const categoryId = useRequestStore((s) => s.categoryId);
  const budget = useRequestStore((s) => s.budget);
  const radiusKm = useRequestStore((s) => s.radiusKm);
  const setCategory = useRequestStore((s) => s.setCategory);
  const setBudget = useRequestStore((s) => s.setBudget);
  const setRadiusKm = useRequestStore((s) => s.setRadiusKm);
  const startMatch = useRequestStore((s) => s.startMatch);

  const [amount, setAmount] = useState(50);
  const inRange = PLACEHOLDER_IN_RANGE_COUNT[radiusKm];

  const setBudgetMode = (mode: 'flex' | 'fixed') => {
    setBudget(mode === 'flex' ? { mode: 'flex' } : { mode: 'fixed', amountUsd: amount });
  };

  const onAmountChange = (value: number) => {
    setAmount(value);
    if (budget.mode === 'fixed') setBudget({ mode: 'fixed', amountUsd: value });
  };

  const sendRequest = () => {
    // Mocked: a real match ID + a real 5-minute expiry, computed client-side
    // for now. Phase 3 replaces this call with POST /v1/matches, and the
    // server-issued id/expiresAt slot into exactly these same store fields —
    // nothing downstream (the searching screen) needs to change.
    const matchId = `match-${String(Date.now())}`;
    const expiresAt = new Date(Date.now() + MATCH_REQUEST_TTL_SECONDS * 1000).toISOString();
    startMatch(matchId, expiresAt);
    router.push('/request/searching');
  };

  return (
    <Screen
      header={<ScreenHeader title="New request" onBack={onBack} />}
      footer={
        <Button
          label={`Send to ${String(inRange)} stylists`}
          onPress={sendRequest}
          block
          size="lg"
          disabled={!categoryId}
          arrow
        />
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
        <SegmentedPills options={BUDGET_MODE_OPTIONS} value={budget.mode} onChange={setBudgetMode} />
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
        <Text variant="sectionLabel" style={styles.sectionLabelSpace}>
          Search radius
        </Text>
        <SegmentedPills
          options={RADIUS_OPTIONS}
          value={radiusKm}
          onChange={(v: RadiusKm) => {
            setRadiusKm(v);
          }}
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
          <Text variant="bodyStrong">5 minutes</Text>
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

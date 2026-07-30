import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { color, space } from '@sc/tokens';
import { MATCH_REQUEST_TTL_SECONDS, canRetry, nextRadiusKm, type RadiusKm } from '@sc/shared';
import { Screen, Text, Button } from '@sc/ui';
import { useCategories } from '../../src/api/hooks/useCategories.js';
import { useRequestStore } from '../../src/state/index.js';

const styles = StyleSheet.create({
  bar: { width: 56, height: 5, borderRadius: 2.5, backgroundColor: color.accent, marginBottom: space.l },
  title: { marginBottom: space.s },
  body: { marginBottom: space.xl },
  panel: {
    borderWidth: 1,
    borderColor: color.divider,
    borderRadius: 20,
    padding: space.l,
    marginBottom: space.l,
  },
  panelRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  actions: { gap: space.s },
});

/**
 * Request expired (handoff screen 4) — no back chevron; the only ways out are
 * TRY AGAIN (climbs the radius ladder, resets budget to flexible, and jumps
 * straight back into a fresh search) or BROWSE STYLISTS INSTEAD.
 */
export default function Expired() {
  const { data: categories } = useCategories();
  const categoryId = useRequestStore((s) => s.categoryId);
  const budget = useRequestStore((s) => s.budget);
  const radiusKm = useRequestStore((s) => s.radiusKm);
  const attempt = useRequestStore((s) => s.attempt);
  const retry = useRequestStore((s) => s.retry);
  const startMatch = useRequestStore((s) => s.startMatch);
  const reset = useRequestStore((s) => s.reset);

  const categoryName = categories?.find((c) => c.id === categoryId)?.name ?? 'a stylist';
  const canTryAgain = canRetry(attempt);
  const next: RadiusKm | null = nextRadiusKm(radiusKm, attempt);
  const budgetLabel = budget.mode === 'fixed' ? `Up to $${String(budget.amountUsd)}` : 'Flexible';

  const tryAgain = () => {
    if (!next) return;
    retry(next);
    const matchId = `match-${String(Date.now())}`;
    const expiresAt = new Date(Date.now() + MATCH_REQUEST_TTL_SECONDS * 1000).toISOString();
    startMatch(matchId, expiresAt);
    router.replace('/request/searching');
  };

  const browseInstead = () => {
    reset();
    router.replace('/(tabs)');
  };

  return (
    <Screen>
      <View style={styles.bar} />
      <Text variant="h2Small" style={styles.title}>
        {canTryAgain ? 'Nobody was free.' : 'Still nobody free.'}
      </Text>
      <Text variant="body" color="neutral700" style={styles.body}>
        Nobody accepted your {categoryName} request within {radiusKm} km.{' '}
        {canTryAgain
          ? 'Widen your search or try again with a flexible budget.'
          : 'Try again in a little while — more stylists come online through the day.'}
      </Text>

      {canTryAgain && next ? (
        <View style={styles.panel}>
          <View style={styles.panelRow}>
            <Text variant="body" color="neutral700">
              Radius
            </Text>
            <Text variant="bodyStrong">
              {radiusKm} km → {next} km
            </Text>
          </View>
          <View style={styles.panelRow}>
            <Text variant="body" color="neutral700">
              Budget
            </Text>
            <Text variant="bodyStrong">{budgetLabel} → Flexible</Text>
          </View>
        </View>
      ) : null}

      <View style={styles.actions}>
        {canTryAgain && next ? (
          <Button label={`Try again — attempt ${String(attempt + 1)}`} block arrow onPress={tryAgain} />
        ) : null}
        <Button
          label="Browse stylists instead"
          variant={canTryAgain ? 'secondary' : 'primary'}
          block
          onPress={browseInstead}
        />
      </View>
    </Screen>
  );
}

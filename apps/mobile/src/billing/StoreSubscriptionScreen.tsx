import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { formatInHarare, formatUsd, type AgentSubscriptionDto } from '@sc/shared';
import { space } from '@sc/tokens';
import { Button, Pressable, RuleList, Screen, ScreenHeader, Text, useTheme } from '@sc/ui';
import { useStoreSubscription } from './storeBilling.js';

const styles = StyleSheet.create({
  section: { marginBottom: space.xxl },
  sectionLabel: { marginBottom: space.m },
  footer: { gap: space.s },
  link: { alignItems: 'center', paddingVertical: space.s },
  note: { marginTop: space.s },
});

/**
 * The agent subscription in the store app: bought through Google Play or the
 * App Store, which both stores require for a subscription like this.
 */
export function StoreSubscriptionScreen({
  subscription,
  productId,
  userId,
  onBack,
}: {
  subscription: AgentSubscriptionDto | undefined;
  productId: string;
  userId: string | null;
  onBack: () => void;
}) {
  const { colors } = useTheme();
  const store = useStoreSubscription(true, productId, userId);
  const storeName = process.env.EXPO_OS === 'ios' ? 'the App Store' : 'Google Play';
  const price = store.displayPrice ?? formatUsd(subscription?.priceUsdCents ?? 0);

  if (store.done) {
    return (
      <Screen
        header={<ScreenHeader title="Agent subscription" onBack={onBack} />}
        footer={
          <Button label="Done" block size="lg" onPress={() => router.replace('/(tabs)/wallet')} />
        }
      >
        <Text variant="h3">Subscription active</Text>
        <Text variant="body" color="neutral700" style={styles.note}>
          It renews through {storeName} until you cancel. You can manage or cancel it any time in{' '}
          {storeName}.
        </Text>
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
          {store.error ? (
            <Text variant="meta" color={colors.accent700} accessibilityRole="alert">
              {store.error}
            </Text>
          ) : null}
          <Button
            label={store.busy ? 'Working…' : `Subscribe for ${price}`}
            block
            size="lg"
            disabled={!store.ready || store.busy || !userId}
            onPress={store.subscribe}
          />
          <Pressable
            accessibilityRole="button"
            onPress={store.restore}
            disabled={store.busy}
            style={styles.link}
          >
            <Text variant="meta" color="neutral700">
              Restore purchase
            </Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={store.manage} style={styles.link}>
            <Text variant="meta" color="neutral700">
              Manage or cancel in {storeName}
            </Text>
          </Pressable>
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
            { label: 'Renews', value: 'Every month until you cancel' },
            { label: 'Price', value: price },
          ]}
        />
        <Text variant="metaSmall" color="neutral600" style={styles.note}>
          Paid through {storeName}. It renews automatically each month at this price until you
          cancel, at least 24 hours before the renewal date, in {storeName}.
          {subscription?.active && subscription.paidUntil
            ? ` Your current cover runs until ${formatInHarare(subscription.paidUntil, 'd MMM yyyy')}.`
            : ''}
        </Text>
      </View>
    </Screen>
  );
}

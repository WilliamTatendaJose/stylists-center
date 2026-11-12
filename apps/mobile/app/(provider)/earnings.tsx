import { memo } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { formatUsd, formatInHarare, type ProviderEarningsJobDto } from '@sc/shared';
import { space } from '@sc/tokens';
import { Screen, ScreenHeader, Text, StatTile, Card, Badge, EmptyPanel, Button } from '@sc/ui';
import { useProviderEarnings } from '../../src/api/hooks/useProviderJobs.js';
import { RoleSwitcher } from '../../src/components/RoleSwitcher.js';

const STATUS_LABEL: Record<ProviderEarningsJobDto['status'], string> = {
  received: 'Paid to you',
  not_paid: "Client didn't pay",
  not_confirmed: 'Not confirmed',
};

const styles = StyleSheet.create({
  statRow: { flexDirection: 'row', gap: space.s, marginBottom: space.m },
  feesButton: { marginBottom: space.xl },
  legacy: { padding: space.l, marginBottom: space.xl },
  legacyText: { marginTop: space.xs },
  sectionLabel: { marginBottom: space.m },
  entry: { padding: space.l, marginBottom: space.s },
  entryTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  entryMiddle: { flex: 1, minWidth: 0, marginRight: space.s },
  entryMeta: { marginTop: 2 },
  entryBreakdown: { marginTop: space.xs, marginBottom: space.s },
});

const keyExtractor = (job: ProviderEarningsJobDto) => job.id;

/** "Price $20.00 · fee $0.60 · coins $1.00" — what made up the job. */
function breakdown(job: ProviderEarningsJobDto): string {
  const parts = [
    `${job.kind === 'booking' ? 'Price' : 'Products'} ${formatUsd(job.priceUsdCents)}`,
  ];
  if (job.feeUsdCents > 0) parts.push(`fee ${formatUsd(job.feeUsdCents)}`);
  if (job.coinsUsdCents > 0) parts.push(`paid in coins ${formatUsd(job.coinsUsdCents)}`);
  return parts.join(' · ');
}

const JobCard = memo(function JobCard({ job }: { job: ProviderEarningsJobDto }) {
  return (
    <Card bordered style={styles.entry}>
      <View style={styles.entryTop}>
        <View style={styles.entryMiddle}>
          <Text variant="cardTitle">{job.counterpartyName}</Text>
          <Text variant="meta" color="neutral700" style={styles.entryMeta}>
            {job.kind === 'booking' ? 'Booking' : 'Order'} {job.reference} ·{' '}
            {formatInHarare(job.at, 'd MMM, HH:mm')}
          </Text>
        </View>
        <Text variant="bodyStrong">{formatUsd(job.receivedUsdCents)}</Text>
      </View>
      <Text variant="metaSmall" color="neutral600" style={styles.entryBreakdown}>
        {breakdown(job)}
      </Text>
      <Badge
        label={STATUS_LABEL[job.status]}
        tone={job.status === 'received' ? 'accent100' : 'neutral'}
      />
    </Card>
  );
});

const renderJob = ({ item }: { item: ProviderEarningsJobDto }) => <JobCard job={item} />;

/**
 * A stylist's or vendor's money under the pay-directly model: what clients
 * and buyers handed over, what is still to collect from confirmed bookings,
 * and the fees owed to StylistsCenter (billed monthly on the Fees screen).
 * Coins clients paid with are in the wallet, not here as cash.
 *
 * Payments made in the app before clients paid directly are the only thing
 * StylistsCenter still pays out; that card appears only while there are any.
 */
export default function Earnings() {
  const { data, isError } = useProviderEarnings();

  if (!data) {
    if (!isError) return null;
    return (
      <Screen
        hasTabBar
        header={<ScreenHeader title="Earnings" showBack={false} right={<RoleSwitcher />} />}
      >
        <EmptyPanel
          title="Couldn't load your earnings"
          body="Check your connection and try again."
        />
      </Screen>
    );
  }

  const hasLegacy =
    data.awaitingPayoutUsdCents > 0 || data.paidOutUsdCents > 0 || data.pendingUsdCents > 0;

  const listHeader = (
    <>
      <View style={styles.statRow}>
        <StatTile value={formatUsd(data.receivedThisMonthUsdCents)} caption="Received this month" />
        <StatTile value={formatUsd(data.toCollectUsdCents)} caption="To collect" />
        <StatTile value={formatUsd(data.feesOwedUsdCents)} caption="Fees owed" />
      </View>
      <Text variant="metaSmall" color="neutral600" style={{ marginBottom: space.m }}>
        {`Clients pay you directly. Received in total: ${formatUsd(data.receivedUsdCents)}.`}
      </Text>
      <Button
        label="See fees and pay"
        variant="secondary"
        block
        style={styles.feesButton}
        onPress={() => router.push('/fees')}
      />

      {hasLegacy ? (
        <Card bordered style={styles.legacy}>
          <Text variant="bodyStrong">Earlier in-app payments</Text>
          <Text variant="meta" color="neutral700" style={styles.legacyText}>
            {`Paid through the app before clients paid you directly. Awaiting payout ${formatUsd(
              data.awaitingPayoutUsdCents,
            )} · paid out ${formatUsd(data.paidOutUsdCents)}${
              data.pendingUsdCents > 0 ? ` · in progress ${formatUsd(data.pendingUsdCents)}` : ''
            }.`}
          </Text>
        </Card>
      ) : null}

      <Text variant="sectionLabel" style={styles.sectionLabel}>
        History
      </Text>
    </>
  );

  return (
    <Screen
      hasTabBar
      header={<ScreenHeader title="Earnings" showBack={false} right={<RoleSwitcher />} />}
      renderList={(listProps) => (
        <FlatList
          {...listProps}
          data={data.jobs}
          keyExtractor={keyExtractor}
          renderItem={renderJob}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            <EmptyPanel body="Completed bookings and orders will show up here." />
          }
        />
      )}
    />
  );
}

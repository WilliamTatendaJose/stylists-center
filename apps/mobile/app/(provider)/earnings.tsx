import { StyleSheet, View } from 'react-native';
import { formatUsd, formatInHarare, type ProviderEarningsEntryDto } from '@sc/shared';
import { space } from '@sc/tokens';
import { Screen, ScreenHeader, Text, StatTile, Card, Badge, EmptyPanel } from '@sc/ui';
import { useProviderEarnings } from '../../src/api/hooks/useProviderJobs.js';

const STATUS_LABEL: Record<ProviderEarningsEntryDto['status'], string> = {
  held: 'In progress',
  released: 'Paid out',
  refunded: 'Refunded',
  failed: 'Failed',
};

const styles = StyleSheet.create({
  statRow: { flexDirection: 'row', gap: space.s, marginBottom: space.xxl },
  sectionLabel: { marginBottom: space.m },
  entry: { padding: space.l, marginBottom: space.s },
  entryTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  entryMiddle: { flex: 1, minWidth: 0 },
  entryMeta: { marginTop: 2 },
});

/**
 * A provider's actual money — released (settled) and pending (held in
 * escrow) totals from the same Payment ledger every booking/order writes
 * to, not the referral "SC Coins" wallet the client tabs use. Before this
 * there was no provider-facing view of the ledger at all.
 */
export default function Earnings() {
  const { data, isError } = useProviderEarnings();

  if (!data) {
    if (!isError) return null;
    return (
      <Screen hasTabBar header={<ScreenHeader title="Earnings" showBack={false} />}>
        <EmptyPanel title="Couldn't load your earnings" body="Check your connection and try again." />
      </Screen>
    );
  }

  return (
    <Screen hasTabBar header={<ScreenHeader title="Earnings" showBack={false} />}>
      <View style={styles.statRow}>
        <StatTile value={formatUsd(data.releasedUsdCents)} caption="Paid out" />
        <StatTile value={formatUsd(data.pendingUsdCents)} caption="In progress" />
      </View>

      <Text variant="sectionLabel" style={styles.sectionLabel}>
        History
      </Text>

      {data.entries.length === 0 ? (
        <EmptyPanel body="Completed bookings and orders will show up here." />
      ) : (
        data.entries.map((entry) => (
          <Card key={entry.id} bordered style={styles.entry}>
            <View style={styles.entryTop}>
              <View style={styles.entryMiddle}>
                <Text variant="cardTitle">{entry.counterpartyName}</Text>
                <Text variant="meta" color="neutral700" style={styles.entryMeta}>
                  {entry.kind === 'booking' ? 'Booking' : 'Order'} {entry.reference} ·{' '}
                  {formatInHarare(entry.createdAt, 'd MMM, HH:mm')}
                </Text>
              </View>
              <Text variant="bodyStrong">{formatUsd(entry.amountUsdCents - entry.feeUsdCents)}</Text>
            </View>
            <Badge
              label={STATUS_LABEL[entry.status]}
              tone={entry.status === 'released' ? 'accent100' : 'neutral'}
            />
          </Card>
        ))
      )}
    </Screen>
  );
}

import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { formatInHarare, formatUsd, type FeeEntryDto } from '@sc/shared';
import { space } from '@sc/tokens';
import {
  Badge,
  Button,
  Card,
  EmptyPanel,
  RuleList,
  Screen,
  ScreenHeader,
  Text,
  useTheme,
} from '@sc/ui';
import { useFeeEntries, useFeeSummary } from '../../src/api/hooks/useFees.js';
import { useBack } from '../../src/navigation/useBack.js';
import { usePendingFeePaymentStore } from '../../src/state/index.js';

const styles = StyleSheet.create({
  section: { marginBottom: space.xxl },
  sectionLabel: { marginBottom: space.m },
  card: { padding: space.l },
  banner: { padding: space.l, marginBottom: space.xl, borderWidth: 1 },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  balance: { marginTop: space.xs },
  entry: { paddingVertical: space.m },
  entryRuled: { borderBottomWidth: 1 },
  entryTop: { flexDirection: 'row', justifyContent: 'space-between', gap: space.m },
  entryCopy: { flex: 1, minWidth: 0 },
  entryMeta: { marginTop: 2 },
  more: { marginTop: space.l },
  action: { marginTop: space.l },
});

const KIND_LABELS: Record<FeeEntryDto['kind'], string> = {
  booking_fee: 'Booking fee',
  order_fee: 'Order commission',
  waiver: 'Fee taken off',
  payment: 'Payment',
  adjustment: 'Correction',
};

function entryTitle(entry: FeeEntryDto): string {
  if (entry.kind === 'booking_fee' || entry.kind === 'order_fee') {
    return entry.label ?? KIND_LABELS[entry.kind];
  }
  return KIND_LABELS[entry.kind];
}

/** "$20.00 at 3% = $0.60": the working behind a fee, so it can be checked against the job. */
function entryWorking(entry: FeeEntryDto): string | null {
  if (entry.baseUsdCents === null || entry.rateBps === null) return null;
  return `${formatUsd(entry.baseUsdCents)} at ${String(entry.rateBps / 100)}%`;
}

function EntryRow({ entry, last }: { entry: FeeEntryDto; last: boolean }) {
  const { colors } = useTheme();
  const working = entryWorking(entry);
  const rule = { borderBottomColor: colors.divider };
  // Fees are owed (shown plain); payments and fees taken off reduce the balance.
  const amount =
    entry.amountUsdCents < 0
      ? `-${formatUsd(-entry.amountUsdCents)}`
      : formatUsd(entry.amountUsdCents);
  return (
    <View style={last ? styles.entry : [styles.entry, styles.entryRuled, rule]}>
      <View style={styles.entryTop}>
        <View style={styles.entryCopy}>
          <Text variant="bodyStrong">{entryTitle(entry)}</Text>
          <Text variant="metaSmall" color="neutral600" style={styles.entryMeta}>
            {[entry.reference, formatInHarare(entry.createdAt, 'd MMM yyyy')]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          {working ? (
            <Text variant="metaSmall" color="neutral600">
              {working}
            </Text>
          ) : null}
          {entry.note ? (
            <Text variant="metaSmall" color="neutral600">
              {entry.note}
            </Text>
          ) : null}
        </View>
        <Text variant="bodyStrong">{amount}</Text>
      </View>
    </View>
  );
}

/** What the stylist or vendor owes StylistsCenter, with the way to pay it. */
export default function Fees() {
  const { colors } = useTheme();
  const onBack = useBack('/(provider)/profile');
  const { data: summary, isError, refetch } = useFeeSummary();
  const entries = useFeeEntries();
  const pending = usePendingFeePaymentStore((state) => state.pending);
  const items = entries.data?.pages.flatMap((page) => page.items) ?? [];
  const statement = summary?.latestStatement ?? null;
  const owes = (summary?.balanceUsdCents ?? 0) > 0;

  return (
    <Screen header={<ScreenHeader title="Fees" onBack={onBack} />}>
      {isError ? (
        <View style={styles.section}>
          <Text variant="body" color="neutral700">
            Couldn&apos;t load your fees.
          </Text>
          <Button
            label="Try again"
            variant="secondary"
            style={styles.action}
            onPress={() => void refetch()}
          />
        </View>
      ) : null}

      {summary?.restricted ? (
        <Card
          bordered
          style={[
            styles.banner,
            { backgroundColor: colors.accent100, borderColor: colors.accent700 },
          ]}
        >
          <Text variant="bodyStrong" color={colors.accent700}>
            Your account is paused
          </Text>
          <Text variant="meta" color={colors.accent700}>
            You can&apos;t take new bookings or orders, and clients can&apos;t find you, until your
            fees are paid.
          </Text>
        </Card>
      ) : null}

      {summary ? (
        <View style={styles.section}>
          <Card bordered style={styles.card}>
            <View style={styles.balanceRow}>
              <View>
                <Text variant="sectionLabel" color="neutral600">
                  You owe
                </Text>
                <Text variant="h2" style={styles.balance}>
                  {formatUsd(Math.max(0, summary.balanceUsdCents))}
                </Text>
                {summary.balanceUsdCents < 0 ? (
                  <Text variant="metaSmall" color="neutral600">
                    You have a credit of {formatUsd(-summary.balanceUsdCents)}.
                  </Text>
                ) : null}
              </View>
              {summary.overdueUsdCents > 0 ? (
                <Badge label={`${formatUsd(summary.overdueUsdCents)} overdue`} tone="accent" />
              ) : null}
            </View>
            <Button
              label={
                pending || summary.paymentPending
                  ? 'Continue payment'
                  : `Pay ${formatUsd(summary.balanceUsdCents)}`
              }
              block
              size="lg"
              style={styles.action}
              disabled={!owes && !pending}
              onPress={() => {
                router.push(pending ? '/fees/paying' : '/fees/pay');
              }}
            />
          </Card>
        </View>
      ) : null}

      {summary ? (
        <View style={styles.section}>
          <Text variant="sectionLabel" style={styles.sectionLabel}>
            This month so far
          </Text>
          <RuleList
            items={[
              { label: 'Jobs', value: String(summary.thisMonth.jobCount) },
              { label: 'Fees', value: formatUsd(summary.thisMonth.feesUsdCents) },
            ]}
          />
          <Text variant="metaSmall" color="neutral600" style={styles.entryMeta}>
            These go on your statement when the month ends.
          </Text>
        </View>
      ) : null}

      {statement ? (
        <View style={styles.section}>
          <Text variant="sectionLabel" style={styles.sectionLabel}>
            Latest statement
          </Text>
          <RuleList
            items={[
              { label: 'Month', value: formatInHarare(statement.periodStart, 'MMMM yyyy') },
              { label: 'Brought forward', value: formatUsd(statement.openingUsdCents) },
              {
                label: 'Fees',
                value: formatUsd(statement.bookingFeesUsdCents + statement.orderFeesUsdCents),
              },
              { label: 'Taken off', value: formatUsd(statement.waiversUsdCents) },
              { label: 'Paid', value: formatUsd(statement.paymentsUsdCents) },
              { label: 'Total', value: formatUsd(statement.closingUsdCents) },
              { label: 'Due by', value: formatInHarare(statement.dueAt, 'd MMM yyyy') },
              ...(statement.unpaidUsdCents > 0
                ? [{ label: 'Still to pay', value: formatUsd(statement.unpaidUsdCents) }]
                : []),
            ]}
          />
        </View>
      ) : null}

      <View style={styles.section}>
        <Text variant="sectionLabel" style={styles.sectionLabel}>
          Fees and payments
        </Text>
        {entries.isLoading ? null : items.length === 0 ? (
          <EmptyPanel body="Fees from your completed jobs and orders will show here." />
        ) : (
          items.map((entry, index) => (
            <EntryRow key={entry.id} entry={entry} last={index === items.length - 1} />
          ))
        )}
        {entries.hasNextPage ? (
          <Button
            label={entries.isFetchingNextPage ? 'Loading…' : 'Show more'}
            variant="secondary"
            block
            style={styles.more}
            disabled={entries.isFetchingNextPage}
            onPress={() => void entries.fetchNextPage()}
          />
        ) : null}
      </View>
    </Screen>
  );
}

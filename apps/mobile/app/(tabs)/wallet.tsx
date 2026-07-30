import { Share, StyleSheet, View } from 'react-native';
import { formatUsd } from '@sc/shared';
import { Screen, ScreenHeader, Text, Badge, Card, Button } from '@sc/ui';
import { color, space } from '@sc/tokens';
import { useCashOut, useReferrals, useWallet } from '../../src/api/hooks/index.js';

const styles = StyleSheet.create({
  balanceBlock: { alignItems: 'flex-start', marginBottom: space.xxl },
  coinsLabel: { marginTop: 2 },
  conversion: { marginTop: space.s, marginBottom: space.l },
  cashOutNote: { marginTop: space.s },
  section: { marginBottom: space.xxl },
  sectionLabel: { marginBottom: space.m },
  referralCard: {
    padding: space.l,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  referralCode: { marginTop: 2 },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: space.s,
    borderBottomWidth: 1,
    borderBottomColor: color.divider,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.ml,
    borderBottomWidth: 1,
    borderBottomColor: color.divider,
  },
  colReferral: { flex: 2 },
  colCoins: { flex: 1 },
  emptyBody: { marginTop: space.s, marginBottom: space.xl },
});

/** Agent wallet (handoff screen 11). Non-agents get an explicit "become an agent" CTA — unspecified in the handoff, but this tab needs some state for a client who hasn't verified yet. */
export default function WalletScreen() {
  const { data: wallet } = useWallet();
  const { data: referrals } = useReferrals();
  const cashOut = useCashOut();

  if (!wallet) return null;

  if (!wallet.isVerifiedAgent) {
    return (
      <Screen hasTabBar header={<ScreenHeader title="Agent wallet" showBack={false} />}>
        <Text variant="h3">Become an agent</Text>
        <Text variant="body" color="neutral700" style={styles.emptyBody}>
          Verify to become an agent and start earning SC Coins — 0.5 coins for every stylist and
          client you refer who completes a booking.
        </Text>
        <Button label="Get verified" block />
      </Screen>
    );
  }

  const shareCode = () => {
    void Share.share({
      message: `Join Stylists Center with my code ${wallet.referralCode} and we both earn SC Coins.`,
    });
  };

  return (
    <Screen
      hasTabBar
      header={
        <ScreenHeader
          title="Agent wallet"
          showBack={false}
          right={<Badge label="Verified agent" tone="accent100" />}
        />
      }
    >
      <View style={styles.balanceBlock}>
        <Text variant="balance" color={color.accent}>
          {wallet.coins}
        </Text>
        <Text variant="kicker" color={color.accent} style={styles.coinsLabel}>
          SC Coins
        </Text>
        <Text variant="meta" color="neutral700" style={styles.conversion}>
          = {formatUsd(wallet.usdCents)} · 1 coin = {formatUsd(wallet.coinUsdCents)}
        </Text>
        <Button
          label={cashOut.isPending ? 'Submitting…' : `Cash out ${formatUsd(wallet.usdCents)}`}
          block
          size="lg"
          disabled={!wallet.canCashOut || cashOut.isPending}
          onPress={() => {
            cashOut.mutate();
          }}
        />
        <Text variant="metaSmall" color="neutral600" style={styles.cashOutNote}>
          {cashOut.isSuccess
            ? 'Submitted — paid to your EcoCash number shortly.'
            : `Cash-out unlocks above ${formatUsd(wallet.cashOutMinUsdCents)}. Paid to your EcoCash number.`}
        </Text>
      </View>

      <View style={styles.section}>
        <Text variant="sectionLabel" style={styles.sectionLabel}>
          Referral code
        </Text>
        <Card bordered style={styles.referralCard}>
          <View>
            <Text variant="metaSmall" color="neutral600">
              Share this code
            </Text>
            <Text variant="h3" style={styles.referralCode}>
              {wallet.referralCode}
            </Text>
          </View>
          <Button label="Share" variant="secondary" onPress={shareCode} />
        </Card>
      </View>

      <View style={styles.section}>
        <Text variant="sectionLabel" style={styles.sectionLabel}>
          Commission
        </Text>
        <View style={styles.tableHeader}>
          <Text variant="metaSmall" color="neutral600" style={styles.colReferral}>
            Referral
          </Text>
          <Text variant="metaSmall" color="neutral600" style={styles.colCoins}>
            Coins
          </Text>
          <Text variant="metaSmall" color="neutral600">
            Status
          </Text>
        </View>
        {referrals?.map((referral) => (
          <View key={referral.id} style={styles.tableRow}>
            <Text variant="body" style={styles.colReferral}>
              {referral.referredName}
            </Text>
            <Text variant="body" style={styles.colCoins}>
              {referral.coins}
            </Text>
            <Badge
              label={referral.status === 'paid' ? 'Paid' : 'Pending'}
              tone={referral.status === 'paid' ? 'accent100' : 'neutral'}
            />
          </View>
        ))}
      </View>
    </Screen>
  );
}

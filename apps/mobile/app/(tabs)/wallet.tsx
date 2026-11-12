import { memo, useState } from 'react';
import { FlatList, Share, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { formatInHarare, formatUsd, type WalletTransactionDto } from '@sc/shared';
import {
  Screen,
  ScreenHeader,
  Text,
  Badge,
  Card,
  Button,
  EmptyPanel,
  TextField,
  useTheme,
} from '@sc/ui';
import { space } from '@sc/tokens';
import {
  useAgentSubscription,
  useClaimReferral,
  useEnrollAgent,
  useReferrals,
  useVerification,
  useWallet,
  useWalletTransactions,
} from '../../src/api/hooks/index.js';
import { describeError } from '../../src/api/errorMessage.js';
import { CoinWalletSection } from '../../src/components/CoinWalletSection.js';
import { RoleSwitcher } from '../../src/components/RoleSwitcher.js';
import { inviteShareLink } from '../../src/sharing/shareLinks.js';

const styles = StyleSheet.create({
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
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.ml,
    borderBottomWidth: 1,
  },
  colReferral: { flex: 1, minWidth: 0, paddingRight: space.s },
  colReward: { width: 88, alignItems: 'flex-end' },
  colStatus: { width: 78, alignItems: 'flex-end', marginLeft: space.s },
  rewardValue: { marginTop: 2 },
  commissionNote: { marginTop: space.s },
  emptyBody: { marginTop: space.s, marginBottom: space.xl },
  verificationStatus: { marginBottom: space.xl },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  referralField: { marginBottom: space.m },
  inviteCard: { padding: space.l, marginBottom: space.xxl },
  inviteTitle: { marginBottom: space.s },
  inviteBody: { marginBottom: space.l },
  inviteField: { marginBottom: space.m },
  sectionEnd: { height: space.xxl },
  transactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.m,
    paddingVertical: space.ml,
    borderBottomWidth: 1,
  },
  transactionCopy: { flex: 1, minWidth: 0 },
  transactionMeta: { marginTop: 2 },
  transactionAmount: { alignItems: 'flex-end', gap: space.xs },
});

const TRANSACTION_LABELS: Record<WalletTransactionDto['type'], string> = {
  referral_coin: 'Recruiting reward',
  referral_purchase: 'Referral purchase reward',
  booking_reward: 'Booking reward',
  purchase_reward: 'Purchase reward',
  redeem_debit: 'Paid with coins',
  redeem_credit: 'Paid to you in coins',
  expiry: 'Coins expired',
  refund: 'Coins returned',
  cash_out: 'Cash out',
  adjustment: 'Wallet adjustment',
};

const keyExtractor = (transaction: WalletTransactionDto) => transaction.id;

const TransactionRow = memo(function TransactionRow({
  transaction,
}: {
  transaction: WalletTransactionDto;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.transactionRow, { borderBottomColor: colors.divider }]}>
      <View style={styles.transactionCopy}>
        <Text variant="bodyStrong">{TRANSACTION_LABELS[transaction.type]}</Text>
        <Text variant="metaSmall" color="neutral600" style={styles.transactionMeta}>
          {transaction.reference ?? 'Wallet activity'} ·{' '}
          {formatInHarare(transaction.createdAt, 'd MMM, HH:mm')}
        </Text>
      </View>
      <View style={styles.transactionAmount}>
        <Text variant="bodyStrong" color={transaction.coins >= 0 ? colors.accent : undefined}>
          {transaction.coins > 0 ? '+' : ''}
          {transaction.coins} coins
        </Text>
        {transaction.type === 'cash_out' ? (
          <Badge
            label={transaction.settled ? 'Paid' : 'Processing'}
            tone={transaction.settled ? 'accent100' : 'neutral'}
          />
        ) : null}
      </View>
    </View>
  );
});

const renderTransaction = ({ item }: { item: WalletTransactionDto }) => (
  <TransactionRow transaction={item} />
);

/** Agent wallet (handoff screen 11). Non-agents get an explicit "become an agent" CTA â€” unspecified in the handoff, but this tab needs some state for a client who hasn't verified yet. */
export default function WalletScreen() {
  const { colors } = useTheme();
  const { data: wallet, isError } = useWallet();
  const { data: referrals } = useReferrals();
  const { data: transactions } = useWalletTransactions();
  const claimReferral = useClaimReferral();
  const enrollAgent = useEnrollAgent();
  const { data: verification } = useVerification();
  const { data: subscription } = useAgentSubscription(Boolean(wallet?.isVerifiedAgent));
  const [cashOutError, setCashOutError] = useState<string | null>(null);
  const [referralCode, setReferralCode] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [inviteError, setInviteError] = useState<string | null>(null);

  const submitInvite = () => {
    const code = inviteCode.trim();
    if (!code) return;
    setInviteError(null);
    claimReferral.mutate(
      { referralCode: code },
      {
        onSuccess: () => setInviteCode(''),
        onError: (error) => setInviteError(describeError(error, "Couldn't apply that invite.")),
      },
    );
  };

  const inviteCard =
    wallet && wallet.referralStatus === 'none' ? (
      <Card bordered style={styles.inviteCard}>
        <Text variant="cardTitle" style={styles.inviteTitle}>
          Have an invite code?
        </Text>
        <Text variant="body" color="neutral700" style={styles.inviteBody}>
          Link it now. Your friend earns {wallet.referralRewardCoins} SC Coins once you are a
          verified agent and have paid your first agent subscription.
        </Text>
        <View style={styles.inviteField}>
          <TextField
            label="Invite code"
            value={inviteCode}
            onChangeText={(value) => {
              setInviteCode(value.toUpperCase());
              setInviteError(null);
            }}
            placeholder="SC-ABC123"
          />
        </View>
        <Button
          label={claimReferral.isPending ? 'Applying…' : 'Apply invite'}
          block
          disabled={!inviteCode.trim() || claimReferral.isPending}
          onPress={submitInvite}
        />
        {inviteError ? (
          <Text variant="meta" color="accent700" style={styles.cashOutNote}>
            {inviteError}
          </Text>
        ) : null}
      </Card>
    ) : wallet && wallet.referredByName ? (
      <Card bordered style={styles.inviteCard}>
        <Text variant="cardTitle" style={styles.inviteTitle}>
          Invite linked
        </Text>
        <Text variant="body" color="neutral700">
          {wallet.referralStatus === 'paid'
            ? `${wallet.referredByName} has earned their reward for inviting you.`
            : `${wallet.referredByName} earns ${String(wallet.referralRewardCoins)} SC Coins once you are a verified agent and have paid your first agent subscription.`}
        </Text>
      </Card>
    ) : null;

  if (!wallet) {
    if (!isError) return null; // still loading â€” Screen renders nothing rather than flash empty content
    return (
      <Screen
        hasTabBar
        header={<ScreenHeader title="Agent wallet" showBack={false} right={<RoleSwitcher />} />}
      >
        <EmptyPanel title="Couldn't load your wallet" body="Check your connection and try again." />
      </Screen>
    );
  }

  if (!wallet.isVerifiedAgent) {
    return (
      <Screen
        hasTabBar
        header={<ScreenHeader title="Agent wallet" showBack={false} right={<RoleSwitcher />} />}
      >
        <View style={styles.section}>
          <CoinWalletSection hideWhenEmpty />
        </View>
        {inviteCard}
        <Text variant="h3">Become an agent</Text>
        <Text variant="body" color="neutral700" style={styles.emptyBody}>
          Verify your identity and subscribe to start earning SC Coins: 1 coin for every $10 spent
          on the marketplace by customers who use your code, and {wallet.referralRewardCoins} coins
          for every agent you recruit once they are verified and have paid their first subscription.
          We delete the uploaded documents after review.
        </Text>
        {verification && verification.status !== 'unverified' ? (
          <View style={styles.verificationStatus}>
            <Badge
              label={verification.status === 'verified' ? 'Verified' : 'Under review'}
              tone={verification.status === 'verified' ? 'accent100' : 'neutral'}
              size="md"
            />
          </View>
        ) : null}
        {verification?.status === 'verified' || wallet.canBecomeAgent ? (
          <>
            {!wallet.referredByName ? (
              <View style={styles.referralField}>
                <TextField
                  label="Referral code (optional)"
                  value={referralCode}
                  onChangeText={setReferralCode}
                  placeholder="e.g. SC-TARI7"
                />
              </View>
            ) : null}
            <Button
              label={enrollAgent.isPending ? 'Joining rewardsâ€¦' : 'Join the rewards programme'}
              block
              disabled={enrollAgent.isPending}
              onPress={() => {
                enrollAgent.mutate(
                  referralCode.trim() ? { referralCode: referralCode.trim() } : {},
                  {
                    onError: (error) => {
                      setCashOutError(describeError(error, "Couldn't join rewards."));
                    },
                  },
                );
              }}
            />
          </>
        ) : (
          <Button label="Get verified" block onPress={() => router.push('/verify')} />
        )}
        {cashOutError ? (
          <Text variant="meta" color="accent700" style={styles.cashOutNote}>
            {cashOutError}
          </Text>
        ) : null}
      </Screen>
    );
  }

  const shareCode = () => {
    void Share.share({
      message: `Join Style Center with my invite link: ${inviteShareLink(wallet.referralCode)}\nI earn SC Coins when you shop with my code.`,
    });
  };

  const listHeader = (
    <>
      <View style={styles.section}>
        <CoinWalletSection />
      </View>

      {subscription ? (
        <View style={styles.section}>
          <Text variant="sectionLabel" style={styles.sectionLabel}>
            Agent subscription
          </Text>
          <Card bordered style={styles.referralCard}>
            <View style={styles.colReferral}>
              <Text variant="bodyStrong">
                {formatUsd(subscription.priceUsdCents)} for {String(subscription.cycleDays)} days
              </Text>
              <Text variant="metaSmall" color="neutral600" style={styles.referralCode}>
                {subscription.paidUntil
                  ? `${subscription.active ? 'Active until' : 'Ended'} ${formatInHarare(subscription.paidUntil, 'd MMM yyyy')}`
                  : 'Not subscribed yet'}
              </Text>
            </View>
            <Button
              label={subscription.active ? 'Renew' : `Pay ${formatUsd(subscription.priceUsdCents)}`}
              variant={subscription.active ? 'secondary' : 'primary'}
              onPress={() => router.push('/agent-subscription')}
            />
          </Card>
          <Text variant="metaSmall" color="neutral600" style={styles.commissionNote}>
            An active subscription is needed to earn on purchases made with your code and to cash
            out agent coins.
          </Text>
        </View>
      ) : null}

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
        <View style={[styles.tableHeader, { borderBottomColor: colors.divider }]}>
          <Text variant="metaSmall" color="neutral600" style={styles.colReferral}>
            Referral
          </Text>
          <View style={styles.colReward}>
            <Text variant="metaSmall" color="neutral600">
              Reward
            </Text>
          </View>
          <View style={styles.colStatus}>
            <Text variant="metaSmall" color="neutral600">
              Status
            </Text>
          </View>
        </View>
        {referrals?.map((referral) => (
          <View key={referral.id} style={[styles.tableRow, { borderBottomColor: colors.divider }]}>
            <Text variant="body" style={styles.colReferral}>
              {referral.referredName}
            </Text>
            <View style={styles.colReward}>
              <Text variant="bodyStrong">
                {referral.status === 'paid' ? '+' : ''}
                {referral.coins} SC
              </Text>
              <Text variant="metaSmall" color="neutral600" style={styles.rewardValue}>
                {formatUsd(referral.coins * wallet.coinUsdCents)}
              </Text>
            </View>
            <View style={styles.colStatus}>
              <Badge
                label={referral.status === 'paid' ? 'Credited' : 'Pending'}
                tone={referral.status === 'paid' ? 'accent100' : 'neutral'}
              />
            </View>
          </View>
        ))}
        <Text variant="metaSmall" color="neutral600" style={styles.commissionNote}>
          Credited rewards are added to your agent coins. A recruit's reward is credited once they
          are a verified agent and have paid their first subscription.
        </Text>
      </View>

      <Text variant="sectionLabel" style={styles.sectionLabel}>
        Wallet activity
      </Text>
    </>
  );

  const listEmpty = <EmptyPanel body="Referral rewards and cash-outs will appear here." />;

  // Closes the section the way its old wrapper's bottom margin did.
  const listFooter = <View style={styles.sectionEnd} />;

  return (
    <Screen
      hasTabBar
      header={
        <ScreenHeader
          title="Agent wallet"
          showBack={false}
          right={
            <View style={styles.headerRight}>
              <Badge label="Verified agent" tone="accent100" />
              <RoleSwitcher />
            </View>
          }
        />
      }
      renderList={(listProps) => (
        <FlatList
          {...listProps}
          data={transactions ?? []}
          keyExtractor={keyExtractor}
          renderItem={renderTransaction}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={listEmpty}
          ListFooterComponent={listFooter}
        />
      )}
    />
  );
}

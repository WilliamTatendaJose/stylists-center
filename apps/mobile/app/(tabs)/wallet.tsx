import { useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { formatInHarare, formatUsd } from '@sc/shared';
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
  useCashOut,
  useClaimReferral,
  useEnrollAgent,
  useReferrals,
  useVerification,
  useWallet,
  useWalletTransactions,
} from '../../src/api/hooks/index.js';
import { describeError } from '../../src/api/errorMessage.js';
import { RoleSwitcher } from '../../src/components/RoleSwitcher.js';
import { inviteShareLink } from '../../src/sharing/shareLinks.js';

const styles = StyleSheet.create({
  balanceBlock: { alignItems: 'flex-start', marginBottom: space.xxl },
  balanceTitle: { marginBottom: space.s },
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

/** Agent wallet (handoff screen 11). Non-agents get an explicit "become an agent" CTA â€” unspecified in the handoff, but this tab needs some state for a client who hasn't verified yet. */
export default function WalletScreen() {
  const { colors } = useTheme();
  const { data: wallet, isError } = useWallet();
  const { data: referrals } = useReferrals();
  const { data: transactions } = useWalletTransactions();
  const cashOut = useCashOut();
  const claimReferral = useClaimReferral();
  const enrollAgent = useEnrollAgent();
  const { data: verification } = useVerification();
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
          Link it now. Your friend earns {wallet.referralRewardCoins} SC Coins after your first
          completed booking.
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
            ? `Your first booking unlocked ${wallet.referredByName}'s reward.`
            : `${wallet.referredByName} earns ${String(wallet.referralRewardCoins)} SC Coins after your first completed booking.`}
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
        {inviteCard}
        <Text variant="h3">Become an agent</Text>
        <Text variant="body" color="neutral700" style={styles.emptyBody}>
          Submit identity verification to become an agent and start earning SC Coins —{' '}
          {wallet.referralRewardCoins} coins for every stylist and client you refer who completes a
          booking. We delete the uploaded documents after review; the first completed booking
          releases the reward.
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

  /**
   * `wallet.coins` is the server's ledger total. A legacy paid referral can
   * occasionally be present in the Commission table before its matching
   * credit reaches that ledger. Once both lists have loaded, include only that
   * missing amount in the display total. This keeps the number on top aligned
   * with paid commissions without treating pending rewards as available or
   * re-adding a reward that was already cashed out.
   */
  const paidReferralCoins =
    referrals?.reduce(
      (total, referral) => total + (referral.status === 'paid' ? referral.coins : 0),
      0,
    ) ?? 0;
  const creditedReferralCoins =
    transactions?.reduce(
      (total, transaction) =>
        total +
        (transaction.type === 'referral_coin' && transaction.coins > 0 ? transaction.coins : 0),
      0,
    ) ?? 0;
  const missingReferralCoins =
    referrals && transactions ? Math.max(0, paidReferralCoins - creditedReferralCoins) : 0;
  const displayCoins = wallet.coins + missingReferralCoins;
  const displayUsdCents = displayCoins * wallet.coinUsdCents;

  const shareCode = () => {
    void Share.share({
      message: `Join Style Center with my invite link: ${inviteShareLink(wallet.referralCode)}\nI earn SC Coins when you complete your first booking.`,
    });
  };

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
    >
      <View style={styles.balanceBlock}>
        <Text variant="sectionLabel" style={styles.balanceTitle}>
          Available balance
        </Text>
        <Text variant="balance" color={colors.accent}>
          {displayCoins} SC
        </Text>
        <Text variant="kicker" color={colors.accent} style={styles.coinsLabel}>
          Coins
        </Text>
        <Text variant="meta" color="neutral700" style={styles.conversion}>
          = {formatUsd(displayUsdCents)} Â· 1 coin = {formatUsd(wallet.coinUsdCents)}
        </Text>
        <Button
          label={cashOut.isPending ? 'Submittingâ€¦' : `Cash out ${formatUsd(wallet.usdCents)}`}
          block
          size="lg"
          disabled={!wallet.canCashOut || cashOut.isPending}
          onPress={() => {
            setCashOutError(null);
            cashOut.mutate(undefined, {
              // A cash-out that failed silently was indistinguishable from one
              // that worked â€” for a withdrawal, that is the one thing a user
              // cannot be left guessing about.
              onError: (error) => {
                setCashOutError(describeError(error, "Couldn't submit that cash-out. Try again."));
              },
            });
          }}
        />
        {cashOutError ? (
          <Text
            variant="metaSmall"
            color={colors.accent700}
            style={styles.cashOutNote}
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
          >
            {cashOutError}
          </Text>
        ) : (
          <Text variant="metaSmall" color="neutral600" style={styles.cashOutNote}>
            {cashOut.isSuccess
              ? 'Submitted â€” paid to your EcoCash number shortly.'
              : `Cash-out unlocks above ${formatUsd(wallet.cashOutMinUsdCents)}. Paid to your EcoCash number.`}
          </Text>
        )}
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
          Credited rewards are added to your available balance. Pending rewards unlock after the
          referral's first completed booking.
        </Text>
      </View>

      <View style={styles.section}>
        <Text variant="sectionLabel" style={styles.sectionLabel}>
          Wallet activity
        </Text>
        {transactions?.length ? (
          transactions.map((transaction) => (
            <View
              key={transaction.id}
              style={[styles.transactionRow, { borderBottomColor: colors.divider }]}
            >
              <View style={styles.transactionCopy}>
                <Text variant="bodyStrong">
                  {transaction.type === 'referral_coin'
                    ? 'Referral reward'
                    : transaction.type === 'cash_out'
                      ? 'Cash out'
                      : 'Wallet adjustment'}
                </Text>
                <Text variant="metaSmall" color="neutral600" style={styles.transactionMeta}>
                  {transaction.reference ?? 'Wallet activity'} ·{' '}
                  {formatInHarare(transaction.createdAt, 'd MMM, HH:mm')}
                </Text>
              </View>
              <View style={styles.transactionAmount}>
                <Text
                  variant="bodyStrong"
                  color={transaction.coins >= 0 ? colors.accent : undefined}
                >
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
          ))
        ) : (
          <EmptyPanel body="Referral rewards and cash-outs will appear here." />
        )}
      </View>
    </Screen>
  );
}

import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { formatInHarare, formatUsd } from '@sc/shared';
import { space } from '@sc/tokens';
import { Button, Card, RuleList, Text, useTheme } from '@sc/ui';
import { useCashOut, useWallet } from '../api/hooks/useWallet.js';
import { describeError } from '../api/errorMessage.js';

const styles = StyleSheet.create({
  card: { padding: space.l },
  headline: { marginBottom: space.m },
  note: { marginTop: space.s },
  action: { marginTop: space.l },
});

export interface CoinWalletSectionProps {
  /** On My page: render nothing until the person actually holds coins. */
  hideWhenEmpty?: boolean;
}

/**
 * Coins at a glance and cash-out: what can be spent, what can be cashed out,
 * when earned coins expire, and when the next cash-out is allowed. Self
 * contained so any screen can drop it in (Rewards, My page).
 *
 * Coins a client earns can pay for services and products but never be cashed
 * out; coins received from clients, and agent earnings while subscribed, can.
 */
export function CoinWalletSection({ hideWhenEmpty = false }: CoinWalletSectionProps) {
  const { colors } = useTheme();
  const { data: wallet } = useWallet();
  const cashOut = useCashOut();
  const [error, setError] = useState<string | null>(null);

  if (!wallet) return null;
  if (hideWhenEmpty && wallet.coins === 0 && !wallet.isVerifiedAgent) return null;

  const cashOutNote = error
    ? error
    : cashOut.isSuccess
      ? 'Submitted. Paid to your EcoCash number after staff approve it.'
      : wallet.nextCashOutAt
        ? `You can cash out again on ${formatInHarare(wallet.nextCashOutAt, 'd MMM yyyy')}.`
        : wallet.cashOutableCoins > 0
          ? `Cash-out needs more than ${formatUsd(wallet.cashOutMinUsdCents)}, once every ${String(wallet.cashOutIntervalDays)} days. Paid to your EcoCash number.`
          : 'Coins you earn from bookings and purchases can be spent but not cashed out.';

  return (
    <Card bordered style={styles.card}>
      <Text variant="sectionLabel" style={styles.headline}>
        Your coins
      </Text>
      <RuleList
        items={[
          { label: 'Total', value: `${String(wallet.coins)} coins` },
          {
            label: 'Can spend',
            value: `${String(wallet.spendableCoins)} coins (${formatUsd(wallet.spendableCoins * wallet.coinUsdCents)})`,
          },
          {
            label: 'Can cash out',
            value: `${String(wallet.cashOutableCoins)} coins (${formatUsd(wallet.cashOutableUsdCents)})`,
          },
          ...(wallet.nextExpiryAt
            ? [
                {
                  label: 'Next to expire',
                  value: `${String(wallet.nextExpiryCoins)} coins on ${formatInHarare(wallet.nextExpiryAt, 'd MMM yyyy')}`,
                },
              ]
            : []),
        ]}
      />
      {wallet.lockedAgentCoins > 0 ? (
        <Text variant="metaSmall" color={colors.accent700} style={styles.note}>
          {String(wallet.lockedAgentCoins)} agent coins are waiting. Pay your agent subscription to
          cash them out.
        </Text>
      ) : null}
      <Button
        label={
          cashOut.isPending ? 'Submitting…' : `Cash out ${formatUsd(wallet.cashOutableUsdCents)}`
        }
        block
        style={styles.action}
        disabled={!wallet.canCashOut || cashOut.isPending}
        onPress={() => {
          setError(null);
          cashOut.mutate(undefined, {
            // A cash-out that failed silently looks the same as one that
            // worked, and that is the one thing a withdrawal can't leave unclear.
            onError: (reason) =>
              setError(describeError(reason, "Couldn't submit that cash-out. Try again.")),
          });
        }}
      />
      <Text
        variant="metaSmall"
        color={error ? colors.accent700 : 'neutral600'}
        style={styles.note}
        accessibilityLiveRegion="polite"
      >
        {cashOutNote}
      </Text>
    </Card>
  );
}

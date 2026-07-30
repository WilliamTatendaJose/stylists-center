import { Screen, ScreenHeader, Text } from '@sc/ui';

/**
 * Agent wallet (handoff screen 11) — placeholder. Note (plan risk, flagged in
 * the plan §11): a non-agent's Wallet tab state is unspecified in the
 * handoff; Phase 1 needs an explicit "become an agent" empty state here.
 */
export default function WalletScreen() {
  return (
    <Screen hasTabBar header={<ScreenHeader title="Agent wallet" showBack={false} />}>
      <Text variant="body" color="neutral700">
        Verify to become an agent and start earning SC Coins.
      </Text>
    </Screen>
  );
}

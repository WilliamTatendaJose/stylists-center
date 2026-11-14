import type { PushService } from '../notifications/push.service';

/** Coins an agent just earned, to tell them about once the change commits. */
export interface AgentEarning {
  agentUserId: string;
  coins: number;
  /** Who earned it for them: the referred customer or the recruited agent. */
  fromName: string;
  kind: 'purchase' | 'recruit';
}

/**
 * Tells an agent they earned coins. Call only after the transaction that
 * wrote the coins has committed, so nobody is told about coins that were
 * rolled back. Best effort, like every push.
 */
export function notifyAgentEarning(
  push: PushService | undefined,
  earning: AgentEarning | null | undefined,
): void {
  if (!push || !earning || earning.coins <= 0) return;
  const coins = `${String(earning.coins)} ${earning.coins === 1 ? 'coin' : 'coins'}`;
  void push.sendToUser(earning.agentUserId, {
    title: `You earned ${coins}`,
    body:
      earning.kind === 'purchase'
        ? `${earning.fromName} bought on the marketplace with your code.`
        : `${earning.fromName} became a verified, subscribed agent with your invite.`,
    data: { type: 'agent.earned' },
  });
}

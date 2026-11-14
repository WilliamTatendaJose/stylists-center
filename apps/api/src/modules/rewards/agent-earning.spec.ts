import { describe, expect, it, vi } from 'vitest';
import type { PushService } from '../notifications/push.service';
import { notifyAgentEarning } from './agent-earning';

describe('notifyAgentEarning', () => {
  const push = () => ({ sendToUser: vi.fn(() => Promise.resolve()) });

  it('tells the agent what they earned and from whom', () => {
    const p = push();
    notifyAgentEarning(p as unknown as PushService, {
      agentUserId: 'agent-1',
      coins: 3,
      fromName: 'Rudo',
      kind: 'purchase',
    });
    expect(p.sendToUser).toHaveBeenCalledWith('agent-1', {
      title: 'You earned 3 coins',
      body: 'Rudo bought on the marketplace with your code.',
      data: { type: 'agent.earned' },
    });
  });

  it('says "coin" for one, and covers a recruit', () => {
    const p = push();
    notifyAgentEarning(p as unknown as PushService, {
      agentUserId: 'agent-1',
      coins: 1,
      fromName: 'Tino',
      kind: 'recruit',
    });
    expect(p.sendToUser).toHaveBeenCalledWith(
      'agent-1',
      expect.objectContaining({
        title: 'You earned 1 coin',
        body: 'Tino became a verified, subscribed agent with your invite.',
      }),
    );
  });

  it('sends nothing when nothing was earned', () => {
    const p = push();
    notifyAgentEarning(p as unknown as PushService, null);
    expect(p.sendToUser).not.toHaveBeenCalled();
  });
});

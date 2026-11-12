import { BadRequestException, Inject, Injectable, Optional } from '@nestjs/common';
import {
  isSubscriptionActive,
  type AgentSubscriptionDto,
  type AgentSubscriptionStatusDto,
  type PayAgentSubscriptionInput,
  type PayAgentSubscriptionResponse,
} from '@sc/shared';
import { PAYMENT_GATEWAY, type PaymentGatewayPort } from '../payments/payment-gateway.port';
import { payerPhoneFor } from '../payments/pay-channels';
import { PaymentStatusService } from '../payments/payment-status.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService, settingsFor } from '../settings/settings.service';
import {
  recordAgentSubscriptionPaymentStatus,
  toAgentSubscriptionDto,
} from './agent-subscription-payment';

/**
 * The agent's $5-for-30-days subscription to the rewards programme, paid
 * through the same gateway as every other payment. New code for agents
 * only; stylists no longer pay a subscription.
 */
@Injectable()
export class AgentSubscriptionService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGatewayPort,
    private readonly statusService: PaymentStatusService,
    @Optional() private readonly settings?: SettingsService,
  ) {}

  async get(userId: string): Promise<AgentSubscriptionDto> {
    const agent = await this.requireAgent(userId);
    return toAgentSubscriptionDto(agent.subscriptionPaidUntil, await this.rates());
  }

  /**
   * Starting a checkout only proves a prompt was sent. The cover is added once
   * the gateway reports `paid`, through its callback or the status poll.
   */
  async pay(
    userId: string,
    input: PayAgentSubscriptionInput,
  ): Promise<PayAgentSubscriptionResponse> {
    const agent = await this.requireAgent(userId);
    if (agent.status !== 'active') {
      throw new BadRequestException('This agent account is not active');
    }
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { phone: true },
    });
    const { subscriptionPriceUsdCents: amountUsdCents } = await this.rates();
    const payChannel = input.payChannel ?? 'ecocash';
    const paymentPhone = payerPhoneFor(payChannel, input.payerPhone, user.phone);
    const reference = `AGSUB-${agent.id}-${String(Date.now())}`;
    const intent = await this.gateway.createCheckout({
      reference,
      amountUsdCents,
      description: 'Style Center agent subscription',
      channel: payChannel,
      ...(paymentPhone ? { phone: paymentPhone } : {}),
    });
    await this.prisma.payment.create({
      data: {
        agentId: agent.id,
        provider: intent.provider,
        status: intent.status,
        amountUsdCents,
        externalRef: intent.externalRef,
        reference,
        channel: payChannel,
        otpUrl: intent.otpUrl ?? null,
      },
    });
    // The fake dev adapter settles instantly ('held'); Paynow answers
    // 'pending' and is credited only once a poll or callback confirms it.
    const paidNow = intent.status === 'held';
    if (paidNow) {
      await recordAgentSubscriptionPaymentStatus(this.prisma, {
        agentId: agent.id,
        reference,
        status: 'paid',
      });
    }
    const paidUntil = paidNow
      ? (await this.requireAgent(userId)).subscriptionPaidUntil
      : agent.subscriptionPaidUntil;
    return {
      paidUntil: paidUntil?.toISOString() ?? null,
      pending: !paidNow,
      ...(intent.checkoutUrl ? { checkoutUrl: intent.checkoutUrl } : {}),
      ...(intent.instructions ? { instructions: intent.instructions } : {}),
      ...(intent.action ? { action: intent.action } : {}),
      reference,
    };
  }

  /** Polled by the app while a payment is in flight. */
  async paymentStatus(userId: string): Promise<AgentSubscriptionStatusDto> {
    const agent = await this.requireAgent(userId);
    const result = await this.statusService.resolve({ agentId: agent.id });
    const { subscriptionPaidUntil } = await this.requireAgent(userId);
    const paidUntil = subscriptionPaidUntil?.toISOString() ?? null;
    return {
      status: result.status as AgentSubscriptionStatusDto['status'],
      paidUntil,
      active: isSubscriptionActive(paidUntil),
    };
  }

  private async requireAgent(userId: string) {
    const agent = await this.prisma.agent.findUnique({ where: { userId } });
    if (!agent) throw new BadRequestException('Become an agent first');
    return agent;
  }

  private rates() {
    return (this.settings ?? settingsFor(this.prisma)).all();
  }
}

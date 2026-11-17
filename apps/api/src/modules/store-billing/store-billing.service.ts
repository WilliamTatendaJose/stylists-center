import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AgentSubscriptionDto, StorePurchaseInput } from '@sc/shared';
import type { Env } from '../../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../notifications/push.service';
import { SettingsService, settingsFor } from '../settings/settings.service';
import { notifyAgentEarning, type AgentEarning } from '../rewards/agent-earning';
import { awardRecruitmentReward } from '../rewards/recruitment';
import { toAgentSubscriptionDto } from '../wallet/agent-subscription-payment';
import { AppStoreClient, decodeJwsPayload } from './app-store.client';
import { GooglePlayClient } from './google-play.client';
import {
  StoreNotConfiguredError,
  StorePurchaseNotFoundError,
  isEntitled,
  type StoreSubscriptionState,
} from './store-subscription';

/**
 * Agent subscriptions sold through Google Play Billing and Apple In-App
 * Purchase. Both stores require their own billing for a subscription that
 * unlocks something in the app, so the store app buys there; this service
 * checks every purchase with the store and turns it into
 * `Agent.subscriptionPaidUntil`, the same field mobile-money payments extend.
 *
 * Trust: only answers fetched from the stores' server APIs count. The app's
 * purchase token and the stores' webhook bodies are only pointers to look up.
 */
@Injectable()
export class StoreBillingService {
  private readonly logger = new Logger(StoreBillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly google: GooglePlayClient,
    private readonly apple: AppStoreClient,
    private readonly config: ConfigService<Env, true>,
    @Optional() private readonly settings?: SettingsService,
    @Optional() private readonly push?: PushService,
  ) {}

  /** The app just bought or restored a subscription: check it and grant access. */
  async verifyPurchase(userId: string, input: StorePurchaseInput): Promise<AgentSubscriptionDto> {
    const agent = await this.prisma.agent.findUnique({ where: { userId } });
    if (!agent) throw new BadRequestException('Become an agent first');
    if (agent.status !== 'active')
      throw new BadRequestException('This agent account is not active');

    const productId = await this.productId();
    if (input.productId !== productId) {
      throw new BadRequestException('That is not the agent subscription');
    }
    const state = await this.lookup(input.platform, input.token, productId);
    if (state.productId !== productId) {
      throw new BadRequestException('That is not the agent subscription');
    }
    // The app tags each purchase with the buyer's user id; a purchase tagged
    // for someone else (a shared or replayed token) never counts here.
    if (state.accountId && state.accountId !== userId.toLowerCase()) {
      throw new ForbiddenException('This purchase belongs to another account');
    }
    const existing = await this.prisma.storeSubscription.findUnique({
      where: { externalId: state.externalId },
    });
    if (existing && existing.userId !== userId) {
      throw new ForbiddenException('This purchase belongs to another account');
    }

    await this.apply(state, { userId, agentId: agent.id });
    if (state.platform === 'google_play' && state.needsAcknowledgement && isEntitled(state)) {
      await this.google.acknowledge(state.productId, state.externalId);
    }
    const fresh = await this.prisma.agent.findUniqueOrThrow({ where: { id: agent.id } });
    return toAgentSubscriptionDto(fresh.subscriptionPaidUntil, await this.rates());
  }

  /** Google Play real-time developer notification (Pub/Sub push). */
  async handleGoogleNotification(token: string | undefined, body: unknown): Promise<void> {
    const expected = this.config.get('GOOGLE_PLAY_RTDN_TOKEN', { infer: true });
    if (!expected || token !== expected) throw new UnauthorizedException();
    const data = (body as { message?: { data?: string } } | null)?.message?.data;
    if (!data) return;
    const notification = JSON.parse(Buffer.from(data, 'base64').toString('utf8')) as {
      subscriptionNotification?: { purchaseToken?: string };
    };
    const purchaseToken = notification.subscriptionNotification?.purchaseToken;
    if (!purchaseToken) return; // test notifications, one-time products
    await this.refresh(await this.lookup('android', purchaseToken, await this.productId()));
  }

  /** App Store Server Notification (version 2). */
  async handleAppleNotification(body: unknown): Promise<void> {
    const signedPayload = (body as { signedPayload?: unknown } | null)?.signedPayload;
    if (typeof signedPayload !== 'string') throw new BadRequestException('signedPayload missing');
    const payload = decodeJwsPayload(signedPayload) as {
      data?: { signedTransactionInfo?: string };
    };
    const signedTx = payload.data?.signedTransactionInfo;
    if (!signedTx) return; // e.g. TEST notifications
    const tx = decodeJwsPayload(signedTx) as {
      transactionId?: string;
      originalTransactionId?: string;
    };
    const transactionId = tx.transactionId ?? tx.originalTransactionId;
    if (!transactionId) return;
    // Re-read from Apple: the notification body is only a pointer.
    await this.refresh(await this.lookup('ios', transactionId, await this.productId()));
  }

  /** Updates a known subscription (or adopts a renewal of one) from the store's answer. */
  private async refresh(state: StoreSubscriptionState): Promise<void> {
    const known =
      (await this.prisma.storeSubscription.findUnique({
        where: { externalId: state.externalId },
      })) ??
      (state.linkedExternalId
        ? await this.prisma.storeSubscription.findUnique({
            where: { externalId: state.linkedExternalId },
          })
        : null);
    let owner = known ? { userId: known.userId, agentId: known.agentId } : null;
    if (!owner && state.accountId) {
      const agent = await this.prisma.agent.findUnique({ where: { userId: state.accountId } });
      if (agent) owner = { userId: agent.userId, agentId: agent.id };
    }
    if (!owner) {
      this.logger.warn(`Store notification for an unknown subscription (${state.platform})`);
      return;
    }
    await this.apply(state, owner);
    if (state.platform === 'google_play' && state.needsAcknowledgement && isEntitled(state)) {
      await this.google.acknowledge(state.productId, state.externalId);
    }
  }

  /**
   * Records the store's answer and moves the agent's paid-until date:
   * forward to the store's expiry while entitled; back to now if the store
   * revoked or refunded the period this subscription had granted. A
   * mobile-money period that runs later is never shortened.
   */
  private async apply(
    state: StoreSubscriptionState,
    owner: { userId: string; agentId: string },
  ): Promise<void> {
    let earning: AgentEarning | null = null;
    await this.prisma.$transaction(async (tx) => {
      const previous = await tx.storeSubscription.findUnique({
        where: { externalId: state.externalId },
      });
      await tx.storeSubscription.upsert({
        where: { externalId: state.externalId },
        create: {
          platform: state.platform,
          externalId: state.externalId,
          userId: owner.userId,
          agentId: owner.agentId,
          productId: state.productId,
          status: state.status,
          expiresAt: state.expiresAt,
          autoRenewing: state.autoRenewing,
          latestOrderId: state.latestOrderId,
        },
        update: {
          status: state.status,
          expiresAt: state.expiresAt,
          autoRenewing: state.autoRenewing,
          latestOrderId: state.latestOrderId,
        },
      });
      const agent = await tx.agent.findUniqueOrThrow({ where: { id: owner.agentId } });
      const current = agent.subscriptionPaidUntil;
      if (isEntitled(state) && state.expiresAt) {
        if (!current || current.getTime() < state.expiresAt.getTime()) {
          await tx.agent.update({
            where: { id: owner.agentId },
            data: { subscriptionPaidUntil: state.expiresAt },
          });
        }
        // First paid subscription can complete a recruit's qualification.
        earning = await awardRecruitmentReward(tx, owner.userId, (await this.rates()).coinUsdCents);
      } else if (state.status === 'revoked') {
        const granted = previous?.expiresAt ?? state.expiresAt;
        if (current && granted && Math.abs(current.getTime() - granted.getTime()) < 60_000) {
          await tx.agent.update({
            where: { id: owner.agentId },
            data: { subscriptionPaidUntil: new Date() },
          });
        }
      }
    });
    notifyAgentEarning(this.push, earning);
  }

  private async lookup(
    platform: 'android' | 'ios',
    token: string,
    productId: string,
  ): Promise<StoreSubscriptionState> {
    try {
      return platform === 'android'
        ? await this.google.getSubscription(token)
        : await this.apple.getSubscription(token, productId);
    } catch (error) {
      if (error instanceof StoreNotConfiguredError) {
        throw new ServiceUnavailableException(
          'Subscriptions through the store are not available yet',
        );
      }
      if (error instanceof StorePurchaseNotFoundError) throw new NotFoundException(error.message);
      throw error;
    }
  }

  private async productId(): Promise<string> {
    return (this.settings ?? settingsFor(this.prisma)).get('storeSubscriptionProductId');
  }

  private rates() {
    return (this.settings ?? settingsFor(this.prisma)).all();
  }
}

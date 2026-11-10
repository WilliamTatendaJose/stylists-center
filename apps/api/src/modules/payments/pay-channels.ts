import { BadRequestException } from '@nestjs/common';
import {
  normalizePhone,
  PAY_CHANNEL_LABELS,
  PHONE_PAY_CHANNELS,
  type PayChannel,
} from '@sc/shared';
import type { PaymentGatewayPort } from './payment-gateway.port';

/**
 * The channels to offer: what the gateway supports, narrowed by the
 * PAYMENT_CHANNELS allow-list when one is set. Order follows the gateway's
 * own list so the app shows a stable order.
 */
export function offeredChannels(
  gateway: Pick<PaymentGatewayPort, 'supportedChannels'>,
  allowList: readonly PayChannel[] | undefined,
): PayChannel[] {
  const supported = gateway.supportedChannels ?? ['ecocash'];
  return allowList ? supported.filter((channel) => allowList.includes(channel)) : [...supported];
}

/** Refuses a channel the gateway cannot take or the allow-list switched off, before any money moves. */
export function assertChannelOffered(
  channel: PayChannel,
  gateway: Pick<PaymentGatewayPort, 'supportedChannels'>,
  allowList: readonly PayChannel[] | undefined,
): void {
  if (!offeredChannels(gateway, allowList).includes(channel)) {
    throw new BadRequestException(`${PAY_CHANNEL_LABELS[channel]} isn't available right now`);
  }
}

/**
 * The E.164 number to bill for a channel, or undefined for card, which needs
 * none. Prefers the number typed at checkout (someone may pay from a line
 * other than the one they log in with) over the account's own.
 */
export function payerPhoneFor(
  channel: PayChannel,
  typedPhone: string | undefined,
  accountPhone: string | null,
): string | undefined {
  if (!PHONE_PAY_CHANNELS.has(channel)) return undefined;
  const typed = typedPhone ? normalizePhone(typedPhone) : null;
  const phone = typed ?? accountPhone;
  if (!phone) {
    throw new BadRequestException(
      `Enter the ${PAY_CHANNEL_LABELS[channel]} number for this payment`,
    );
  }
  return phone;
}

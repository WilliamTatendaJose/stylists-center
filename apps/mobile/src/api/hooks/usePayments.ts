import { useMutation, useQuery } from '@tanstack/react-query';
import type { PayChannel, PayChannelsResponse, SubmitPaymentOtpInput } from '@sc/shared';
import { apiFetch } from '../client.js';

/**
 * What an API too old to have the channels endpoint can take. Falling back to
 * this (rather than to every channel) means a stale server is never asked for
 * a wallet it cannot charge.
 */
const FALLBACK_CHANNELS: PayChannel[] = ['ecocash'];

/**
 * `GET /v1/payments/channels` — the wallets and cards the live gateway takes.
 * Server-decided so a method Paynow has not switched on can be hidden without
 * an app release.
 */
export function usePayChannels(options: { excludeCard?: boolean } = {}) {
  const query = useQuery({
    queryKey: ['payments', 'channels'],
    queryFn: () => apiFetch<PayChannelsResponse>('/v1/payments/channels', { auth: false }),
    staleTime: 5 * 60 * 1000,
  });
  const channels = (query.data?.channels ?? FALLBACK_CHANNELS).filter(
    (channel) => !(options.excludeCard && channel === 'card'),
  );
  return { channels, isLoading: query.isLoading };
}

/** `POST /v1/payments/otp` — forwards the code O'mari texted the payer. */
export function useSubmitPaymentOtp() {
  return useMutation({
    mutationFn: (input: SubmitPaymentOtpInput) =>
      apiFetch<void>('/v1/payments/otp', { method: 'POST', body: input }),
  });
}

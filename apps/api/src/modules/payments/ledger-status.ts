import type { PaymentPollStatus } from './payment-gateway.port';

/**
 * Paynow's own status vocabulary, collapsed onto the ledger's. Shared by the
 * inbound webhook (payments.service.ts) and the outbound poll
 * (paynow.adapter.ts) so a callback and a poll of the same transaction can
 * never disagree about what a given Paynow status means.
 */
export function ledgerStatus(status: string | undefined): PaymentPollStatus {
  switch (status?.toLowerCase()) {
    case 'paid':
    case 'awaiting delivery':
    case 'delivered':
      return 'paid';
    case 'refunded':
      return 'refunded';
    case 'cancelled':
      return 'failed';
    case 'disputed':
      return 'disputed';
    default:
      return 'pending';
  }
}

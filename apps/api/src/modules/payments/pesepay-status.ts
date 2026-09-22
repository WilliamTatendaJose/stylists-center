import type { PaymentPollStatus } from './payment-gateway.port';

/**
 * Pesepay's transaction-status vocabulary, collapsed onto the ledger's.
 * Shared by the poll and the result callback so both routes to "what happened"
 * agree.
 *
 * Unknown values fall through to 'pending' rather than 'failed': a status
 * Pesepay adds later must not void a booking whose payment may yet clear.
 */
export function pesepayLedgerStatus(status: string | undefined): PaymentPollStatus {
  switch (status?.toUpperCase()) {
    case 'SUCCESS':
      return 'paid';
    case 'REVERSED':
      return 'refunded';
    // Everything the customer or their bank refused, plus the transaction
    // simply running out of time. All terminal, all "no money arrived".
    case 'AUTHORIZATION_FAILED':
    case 'CANCELLED':
    case 'CLOSED':
    case 'CLOSED_PERIOD_ELAPSED':
    case 'DECLINED':
    case 'ERROR':
    case 'FAILED':
    case 'INSUFFICIENT_FUNDS':
    case 'SERVICE_UNAVAILABLE':
    case 'TERMINATED':
      return 'failed';
    // INITIATED / PENDING / PROCESSING, and PARTIALLY_PAID — which is not
    // payment of the amount that was asked for, so it must not read as 'paid'.
    default:
      return 'pending';
  }
}

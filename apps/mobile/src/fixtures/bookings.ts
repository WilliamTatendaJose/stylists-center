import type { BookingRowDto } from '@sc/shared';
import { PROVIDER_IDS } from './providers.js';

/**
 * One booking per Bookings-screen row state (handoff screen 9), so the
 * screen's three branches are all exercised without a backend:
 *  - awaiting_provider + canTravel -> I'M ON MY WAY / DIRECTIONS
 *  - confirmed + cash + one-sided confirmation -> the reconciliation panel,
 *    using the exact "Kudzai has already confirmed" example from the handoff
 *  - completed + canRate -> RATE STYLIST / Report a problem
 */
export const BOOKING_ROWS: BookingRowDto[] = [
  {
    id: 'bk-awaiting',
    counterpartyName: 'Tariro',
    tint: '#201e1d',
    initials: 'TM',
    serviceName: 'Cornrows',
    whenLabel: 'Today 16:30',
    paymentMethod: 'ecocash',
    priceUsdCents: 1800,
    status: 'awaiting_provider',
    confirmedByClient: false,
    confirmedByProvider: false,
    canTravel: true,
    canRate: false,
  },
  {
    id: 'bk-cash-reconcile',
    counterpartyName: 'Kudzai',
    tint: '#605d5d',
    initials: 'KK',
    serviceName: 'Gel overlay',
    whenLabel: 'Yesterday 13:00',
    paymentMethod: 'cash',
    priceUsdCents: 1200,
    status: 'confirmed',
    confirmedByClient: false,
    confirmedByProvider: true,
    canTravel: false,
    canRate: false,
  },
  {
    id: 'bk-completed',
    counterpartyName: 'Rudo',
    tint: '#7c1405',
    initials: 'RM',
    serviceName: 'Skin fade',
    whenLabel: 'Mon 10:00',
    paymentMethod: 'cash',
    priceUsdCents: 1000,
    status: 'completed',
    confirmedByClient: true,
    confirmedByProvider: true,
    canTravel: false,
    canRate: true,
  },
];

/** Which provider each booking's directions/chat screens should resolve to. */
export const BOOKING_PROVIDER: Record<string, string> = {
  'bk-awaiting': PROVIDER_IDS.tariro,
  'bk-cash-reconcile': PROVIDER_IDS.kudzai,
  'bk-completed': PROVIDER_IDS.rudo,
};

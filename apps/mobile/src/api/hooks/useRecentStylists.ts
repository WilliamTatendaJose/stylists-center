import { useMemo } from 'react';
import { useMyBookings } from './useBookings.js';

/** Enough to recognise a regular without pushing the browse view off the screen. */
const MAX_RECENT = 3;

export interface RecentStylist {
  providerId: string;
  displayName: string;
  tint: string;
  initials: string;
  lastServiceName: string;
}

/**
 * The stylists this client has actually completed a booking with, most
 * recent first and one row per stylist.
 *
 * Beauty is a high-repeat category: a returning user's fastest path is the
 * person who did their hair last month, not a category grid and a search.
 * Derived from bookings the app already fetches for the Bookings tab, so this
 * costs no extra request — react-query serves both from one cache entry.
 */
export function useRecentStylists() {
  const { data: bookings, isError } = useMyBookings();

  const recent = useMemo(() => {
    if (!bookings) return [];

    const seen = new Set<string>();
    const out: RecentStylist[] = [];

    for (const booking of bookings) {
      // Only a finished job proves the pairing worked. An awaiting or
      // cancelled booking is not evidence of a stylist worth going back to.
      if (booking.status !== 'completed') continue;
      if (seen.has(booking.providerId)) continue;

      seen.add(booking.providerId);
      out.push({
        providerId: booking.providerId,
        displayName: booking.counterpartyName,
        tint: booking.tint,
        initials: booking.initials,
        lastServiceName: booking.serviceName,
      });

      if (out.length === MAX_RECENT) break;
    }

    return out;
  }, [bookings]);

  return { recent, isError };
}

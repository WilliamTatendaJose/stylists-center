/**
 * Where a tapped notification should land.
 *
 * Split from the listener that consumes it so the mapping is unit-testable —
 * expo-notifications and expo-router cannot both be loaded in a node test
 * environment, and this is the part with the decisions in it.
 *
 * The shapes here must match what the API puts in `data` (see PushService
 * callers): a `type` naming the event and whatever id that screen needs.
 * Anything unrecognised returns null, which means "just open the app" — a
 * notification from a newer server than the installed app is a normal state,
 * not an error, and must never crash the launch path.
 */
export function notificationRoute(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null;
  const { type, matchId, conversationId, bookingId } = data as Record<string, unknown>;

  switch (type) {
    case 'match.offered':
      // The stylist's Jobs screen is where a live offer can actually be
      // accepted; there is no per-offer route to deep link to.
      return typeof matchId === 'string' ? '/(provider)/jobs' : null;
    case 'message.created':
      return typeof conversationId === 'string' ? `/chat/${conversationId}` : null;
    case 'booking.updated':
      return typeof bookingId === 'string' ? '/(tabs)/bookings' : null;
    default:
      return null;
  }
}

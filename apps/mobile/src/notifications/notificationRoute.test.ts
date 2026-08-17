import { describe, expect, it } from 'vitest';
import { notificationRoute } from './notificationRoute.js';

/**
 * The payloads below mirror exactly what PushService's callers put in `data`
 * (apps/api: matching.service, chat.service, provider.service, bookings.service).
 * If those change, these should fail — that is the point of writing them out
 * rather than building them from a shared helper.
 */
describe('notificationRoute', () => {
  it('sends a job offer to the screen where it can actually be accepted', () => {
    expect(notificationRoute({ type: 'match.offered', matchId: 'm-1' })).toBe('/(provider)/jobs');
  });

  it('opens the specific conversation a message belongs to', () => {
    expect(notificationRoute({ type: 'message.created', conversationId: 'c-1' })).toBe('/chat/c-1');
  });

  it('opens the bookings list for a booking update', () => {
    expect(notificationRoute({ type: 'booking.updated', bookingId: 'b-1' })).toBe(
      '/(tabs)/bookings',
    );
  });

  it('ignores a known type whose id is missing, rather than routing somewhere broken', () => {
    expect(notificationRoute({ type: 'message.created' })).toBeNull();
    expect(notificationRoute({ type: 'booking.updated', bookingId: 42 })).toBeNull();
  });

  it('ignores an unrecognised type, which is what a newer server looks like', () => {
    // An older build must not crash on an event it has never heard of; it
    // just opens the app.
    expect(notificationRoute({ type: 'something.invented.later', id: 'x' })).toBeNull();
  });

  it('survives payloads that are not objects at all', () => {
    for (const value of [null, undefined, 'string', 7, []]) {
      expect(notificationRoute(value)).toBeNull();
    }
  });
});

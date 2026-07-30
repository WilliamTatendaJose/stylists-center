import type { MatchOfferDto, MatchRequestDto } from '../dto/matching.js';
import type { BookingRowDto } from '../dto/bookings.js';
import type { MessageDto } from '../dto/chat.js';

/**
 * Typed Socket.IO event map, shared by the NestJS gateway and the mobile
 * client. Keeping this in one file is what makes a payload shape change show
 * up as a compile error on both sides instead of a silent runtime mismatch.
 *
 * Room naming (see the API's realtime module): `user:{userId}`,
 * `match:{matchId}`, `booking:{bookingId}`, `trip:{tripId}`.
 *
 * Transport is websocket-only — long-polling on flaky mobile networks causes
 * duplicate-delivery pain — and sockets are a latency optimisation only: the
 * client refetches the relevant HTTP resource on every reconnect, because
 * these events are not guaranteed to arrive (see plan §6, "Socket.IO is a
 * latency optimisation, HTTP is the truth").
 */
export interface ServerToClientEvents {
  /** Sent to provider `user:{id}` rooms when a new match request is fanned out to them. */
  'match.offered': (payload: {
    matchId: string;
    categoryName: string;
    budgetLabel: string;
  }) => void;
  /** Sent to the client's `match:{id}` room whenever a provider accepts. */
  'match.offer.accepted': (offer: MatchOfferDto) => void;
  /** Sent to a provider whose accepted offer lost to a sibling being confirmed. */
  'match.offer.superseded': (payload: { matchId: string; offerId: string }) => void;
  /** The match hit its 5-minute TTL with no confirmed booking. */
  'match.expired': (payload: { matchId: string; attempt: number }) => void;
  'match.cancelled': (payload: { matchId: string }) => void;
  'booking.updated': (booking: BookingRowDto) => void;
  'message.created': (message: MessageDto) => void;
  'message.typing': (payload: { conversationId: string; userId: string }) => void;
  'trip.location': (payload: {
    tripId: string;
    lat: number;
    lng: number;
    etaMinutes: number;
  }) => void;
}

export interface ClientToServerEvents {
  /** Joins `match:{matchId}` and acks with current state, covering the case
   *  where the request was created via HTTP just before the socket connected. */
  'match.subscribe': (payload: { matchId: string }, ack: (state: MatchRequestDto) => void) => void;
  'message.typing': (payload: { conversationId: string }) => void;
}

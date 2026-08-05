import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BookingRowDto,
  ConfirmCompletionResponse,
  CreateBookingInput,
  CreateBookingResponse,
  CreateReviewInput,
} from '@sc/shared';
import { apiFetch } from '../client.js';
import { getSocket } from '../../realtime/socket.js';

const BOOKINGS_KEY = ['bookings'] as const;

/** `GET /v1/bookings` — the Bookings tab's three row states (awaiting/cash-reconcile/completed). */
export function useMyBookings() {
  return useQuery({
    queryKey: BOOKINGS_KEY,
    queryFn: () => apiFetch<BookingRowDto[]>('/v1/bookings'),
  });
}

/**
 * `POST /v1/bookings/:id/cancel`. Returns the updated row, so the cache is
 * seeded from the response instead of guessing the new state locally.
 */
export function useCancelBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (bookingId: string) =>
      apiFetch<BookingRowDto>(`/v1/bookings/${bookingId}/cancel`, { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: BOOKINGS_KEY });
    },
  });
}

/**
 * The API already emits `booking.updated` whenever a booking changes, and
 * nothing was listening — so a provider confirming an appointment left the
 * client's screen stale until they navigated away and back.
 *
 * Per the socket contract, events are a signal to refetch, never the source
 * of truth: the payload is discarded and the HTTP GET stays authoritative.
 */
export function useBookingUpdates() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onUpdated = () => {
      void queryClient.invalidateQueries({ queryKey: BOOKINGS_KEY });
    };

    socket.on('booking.updated', onUpdated);
    return () => {
      socket.off('booking.updated', onUpdated);
    };
  }, [queryClient]);
}

/** `POST /v1/bookings` — Payment screen's confirm action. */
export function useCreateBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateBookingInput) =>
      apiFetch<CreateBookingResponse>('/v1/bookings', { method: 'POST', body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: BOOKINGS_KEY });
    },
  });
}

/** `POST /v1/bookings/:id/confirm-completion` — the cash-reconciliation "Yes, it happened" button. */
export function useConfirmCompletion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (bookingId: string) =>
      apiFetch<ConfirmCompletionResponse>(`/v1/bookings/${bookingId}/confirm-completion`, {
        method: 'POST',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: BOOKINGS_KEY });
    },
  });
}

/** `POST /v1/bookings/:id/reviews` — "Rate stylist". */
export function useCreateReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ bookingId, input }: { bookingId: string; input: CreateReviewInput }) =>
      apiFetch<void>(`/v1/bookings/${bookingId}/reviews`, { method: 'POST', body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: BOOKINGS_KEY });
    },
  });
}

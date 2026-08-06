import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ProviderAvailabilityDto, ProviderEarningsDto, ProviderJobsDto } from '@sc/shared';
import { apiFetch } from '../client.js';
import { getSocket } from '../../realtime/socket.js';

export const PROVIDER_JOBS_KEY = ['provider', 'jobs'] as const;

/**
 * `GET /v1/provider/jobs` — availability, live offers and active work in one
 * request, because this is a dashboard rather than three separate lists.
 *
 * Polled: a smart-match offer has a short response deadline, and a stylist
 * who only finds out on manual refresh has already lost the job.
 */
const JOBS_POLL_MS = 30_000;

export function useProviderJobs() {
  return useQuery({
    queryKey: PROVIDER_JOBS_KEY,
    queryFn: () => apiFetch<ProviderJobsDto>('/v1/provider/jobs'),
    refetchInterval: JOBS_POLL_MS,
  });
}

/** `GET /v1/provider/earnings` — the Earnings tab's released/pending totals and the ledger entries behind them. */
export function useProviderEarnings() {
  return useQuery({
    queryKey: ['provider', 'earnings'],
    queryFn: () => apiFetch<ProviderEarningsDto>('/v1/provider/earnings'),
  });
}

/**
 * Offers and bookings both arrive by socket, so a stylist sees either land
 * without waiting for the next poll.
 *
 * `match.offered` is the event that actually fires when a new smart-match
 * request reaches this stylist — the server joins every authenticated socket
 * to its own `user:{id}` room on connect, so no extra subscribe call is
 * needed. `match.offer.superseded` and `match.expired` clear an offer that
 * stopped being answerable (a sibling accepted first, or the client's window
 * ran out) — without them a stylist could tap Accept on an offer that had
 * already gone, and only find out from the resulting error.
 */
export function useProviderJobsRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: PROVIDER_JOBS_KEY });
    };

    socket.on('booking.updated', refresh);
    socket.on('match.offered', refresh);
    socket.on('match.offer.superseded', refresh);
    socket.on('match.expired', refresh);
    return () => {
      socket.off('booking.updated', refresh);
      socket.off('match.offered', refresh);
      socket.off('match.offer.superseded', refresh);
      socket.off('match.expired', refresh);
    };
  }, [queryClient]);
}

function useJobsMutation<TInput>(path: (input: TInput) => string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: TInput) => apiFetch<void>(path(input), { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PROVIDER_JOBS_KEY });
    },
  });
}

export function useConfirmBooking() {
  return useJobsMutation<string>((id) => `/v1/provider/bookings/${id}/confirm`);
}

export function useDeclineBooking() {
  return useJobsMutation<string>((id) => `/v1/provider/bookings/${id}/decline`);
}

export function useProviderConfirmCompletion() {
  return useJobsMutation<string>((id) => `/v1/provider/bookings/${id}/confirm-completion`);
}

export function useAcceptOffer() {
  return useJobsMutation<string>((id) => `/v1/provider/offers/${id}/accept`);
}

export function useDeclineOffer() {
  return useJobsMutation<string>((id) => `/v1/provider/offers/${id}/decline`);
}

export function useSetAvailability() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (acceptingBookings: boolean) =>
      apiFetch<ProviderAvailabilityDto>('/v1/provider/availability', {
        method: 'POST',
        body: { acceptingBookings },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PROVIDER_JOBS_KEY });
    },
  });
}

import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Budget, CreateMatchRequestResponse, MatchRequestDto, RadiusKm } from '@sc/shared';
import { apiFetch } from '../client.js';
import { useSessionStore } from '../../state/index.js';
import { getSocket } from '../../realtime/socket.js';

export function matchQueryKey(matchId: string | null) {
  return ['match', matchId] as const;
}

interface CreateMatchInput {
  categoryId: string;
  budget: Budget;
  radiusKm: RadiusKm;
}

/** `POST /v1/matches` — the client's current location rides along so a later retry can re-fan-out without resending it. */
export function useCreateMatch() {
  const location = useSessionStore((s) => s.location);

  return useMutation({
    mutationFn: (input: CreateMatchInput) =>
      apiFetch<CreateMatchRequestResponse>('/v1/matches', {
        method: 'POST',
        body: { ...input, location },
      }),
  });
}

/** `GET /v1/matches/:id` — the source of truth for the searching/expired screens; sockets only prompt a refetch. */
export function useMatch(matchId: string | null) {
  return useQuery({
    queryKey: matchQueryKey(matchId),
    queryFn: () => apiFetch<MatchRequestDto>(`/v1/matches/${String(matchId)}`),
    enabled: !!matchId,
  });
}

/** `POST /v1/matches/:id/retry` — same matchId; the server escalates the radius ladder and re-fans-out. */
export function useRetryMatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (matchId: string) =>
      apiFetch<CreateMatchRequestResponse>(`/v1/matches/${matchId}/retry`, { method: 'POST' }),
    onSuccess: (_data, matchId) => {
      void queryClient.invalidateQueries({ queryKey: matchQueryKey(matchId) });
    },
  });
}

/** `POST /v1/matches/:id/cancel`. */
export function useCancelMatch() {
  return useMutation({
    mutationFn: (matchId: string) =>
      apiFetch<void>(`/v1/matches/${matchId}/cancel`, { method: 'POST' }),
  });
}

/**
 * Joins the `match:{id}` socket room for as long as the caller is mounted
 * with a live matchId, and treats every event as nothing more than a cue to
 * refetch — sockets are a latency optimisation only (plan §6), the HTTP GET
 * above stays the source of truth. The `match.subscribe` ack is the one
 * exception: it hydrates the query with the room-join-time snapshot, so a
 * socket that connects just after the HTTP create still renders correctly.
 */
export function useMatchRealtime(matchId: string | null): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!matchId) return undefined;
    const socket = getSocket();
    if (!socket) return undefined;

    const refetch = () => {
      void queryClient.invalidateQueries({ queryKey: matchQueryKey(matchId) });
    };

    socket.emit('match.subscribe', { matchId }, (state) => {
      queryClient.setQueryData(matchQueryKey(matchId), state);
    });
    socket.on('match.offer.accepted', refetch);
    socket.on('match.expired', refetch);
    socket.on('match.cancelled', refetch);

    return () => {
      socket.off('match.offer.accepted', refetch);
      socket.off('match.expired', refetch);
      socket.off('match.cancelled', refetch);
    };
  }, [matchId, queryClient]);
}

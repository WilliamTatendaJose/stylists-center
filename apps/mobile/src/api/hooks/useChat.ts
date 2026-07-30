import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ConversationDto, MessageDto, SendMessageInput } from '@sc/shared';
import { apiFetch } from '../client.js';
import { getSocket } from '../../realtime/socket.js';

const CONVERSATIONS_KEY = ['conversations'] as const;

function messagesKey(conversationId: string | null) {
  return ['conversations', conversationId, 'messages'] as const;
}

/** `GET /v1/conversations` — the Messages inbox. */
export function useConversations() {
  return useQuery({
    queryKey: CONVERSATIONS_KEY,
    queryFn: () => apiFetch<ConversationDto[]>('/v1/conversations'),
  });
}

/** `POST /v1/conversations` — finds-or-creates the 1:1 thread with a provider, for "Message" buttons that only know a providerId. */
export function useStartConversation() {
  return useMutation({
    mutationFn: (providerId: string) =>
      apiFetch<ConversationDto>('/v1/conversations', { method: 'POST', body: { providerId } }),
  });
}

/** `GET /v1/conversations/:id/messages` — also marks the thread read server-side. */
export function useConversationMessages(conversationId: string | null) {
  return useQuery({
    queryKey: messagesKey(conversationId),
    queryFn: () => apiFetch<MessageDto[]>(`/v1/conversations/${String(conversationId)}/messages`),
    enabled: !!conversationId,
  });
}

/** `POST /v1/conversations/:id/messages`. */
export function useSendMessage(conversationId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SendMessageInput) =>
      apiFetch<MessageDto>(`/v1/conversations/${String(conversationId)}/messages`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: messagesKey(conversationId) });
      void queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY });
    },
  });
}

/** Joins `conversation:{id}` and treats every `message.created` as a cue to refetch — sockets are a latency optimisation only, HTTP stays the source of truth. */
export function useChatRealtime(conversationId: string | null): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!conversationId) return undefined;
    const socket = getSocket();
    if (!socket) return undefined;

    socket.emit('conversation.subscribe', { conversationId });

    const refetch = (message: MessageDto) => {
      if (message.conversationId !== conversationId) return;
      void queryClient.invalidateQueries({ queryKey: messagesKey(conversationId) });
      void queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY });
    };
    socket.on('message.created', refetch);

    return () => {
      socket.off('message.created', refetch);
    };
  }, [conversationId, queryClient]);
}

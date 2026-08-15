import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ConversationDto, MessageDto } from '@sc/shared';
import type { DocumentPickerAsset } from 'expo-document-picker';
import { File } from 'expo-file-system';
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

/** Finds-or-creates the authorized buyer/seller thread attached to an order. */
export function useStartOrderConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (orderId: string) =>
      apiFetch<ConversationDto>(`/v1/conversations/orders/${orderId}`, { method: 'POST' }),
    onSuccess: (conversation) => {
      queryClient.setQueryData<ConversationDto[]>(CONVERSATIONS_KEY, (current = []) => [
        conversation,
        ...current.filter((row) => row.id !== conversation.id),
      ]);
    },
  });
}

/** `GET /v1/conversations/:id/messages` — also marks the thread read server-side. */
export function useConversationMessages(conversationId: string | null) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: messagesKey(conversationId),
    queryFn: async () => {
      const messages = await apiFetch<MessageDto[]>(
        `/v1/conversations/${String(conversationId)}/messages`,
      );
      // This GET also marks the thread read on the server.
      void queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY, exact: true });
      return messages;
    },
    enabled: !!conversationId,
  });
}

export interface SendChatMessageInput {
  text: string;
  attachments: DocumentPickerAsset[];
}

function messageForm(input: SendChatMessageInput): FormData {
  const form = new FormData();
  form.append('text', input.text);
  input.attachments.forEach((asset) => {
    if (asset.file) {
      form.append('files', asset.file, asset.name);
    } else {
      form.append('files', new File(asset.uri), asset.name);
    }
  });
  return form;
}

/** `POST /v1/conversations/:id/messages`. */
export function useSendMessage(conversationId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SendChatMessageInput) =>
      apiFetch<MessageDto>(`/v1/conversations/${String(conversationId)}/messages`, {
        method: 'POST',
        body: messageForm(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: messagesKey(conversationId) });
      void queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY, exact: true });
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
      void queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY, exact: true });
    };
    socket.on('message.created', refetch);
    const refreshReadState = (payload: { conversationId: string; readByUserId: string }) => {
      if (payload.conversationId !== conversationId) return;
      void queryClient.invalidateQueries({ queryKey: messagesKey(conversationId) });
      void queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY, exact: true });
    };
    socket.on('conversation.read', refreshReadState);

    return () => {
      socket.off('message.created', refetch);
      socket.off('conversation.read', refreshReadState);
    };
  }, [conversationId, queryClient]);
}

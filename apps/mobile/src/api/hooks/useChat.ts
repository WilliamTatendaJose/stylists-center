import { useEffect } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { CHAT_MESSAGES_DEFAULT_LIMIT, type ConversationDto, type MessageDto } from '@sc/shared';
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

/**
 * Unread messages across every conversation, for the Messages tab badge, in
 * the form React Navigation's `tabBarBadge` takes: undefined when there are
 * none (so no badge renders), capped at "99+".
 *
 * Kept live without polling: the server emits `message.created` to the
 * recipient's own `user:{id}` room for every new message and
 * `conversation.read` when a thread is read elsewhere, and either one
 * refetches the inbox, whose rows carry their own `unreadCount`.
 */
export function useUnreadMessagesBadge(): number | string | undefined {
  const queryClient = useQueryClient();
  const { data } = useConversations();

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY, exact: true });
    };
    socket.on('message.created', refresh);
    socket.on('conversation.read', refresh);
    return () => {
      socket.off('message.created', refresh);
      socket.off('conversation.read', refresh);
    };
  }, [queryClient]);

  const unread = (data ?? []).reduce((sum, conversation) => sum + conversation.unreadCount, 0);
  if (unread <= 0) return undefined;
  return unread > 99 ? '99+' : unread;
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

/**
 * The thread is an infinite query whose pages are each ascending `MessageDto[]`
 * and are stored newest page first: pages[0] is the latest page, later pages
 * are progressively older. The cursor is the id of the oldest message of the
 * last page. A refetch (realtime cue, send) re-walks the loaded pages, so the
 * pages stay contiguous while new messages arrive.
 */
type MessagePages = InfiniteData<MessageDto[], string | undefined>;

/** Oldest page first, each page already ascending: plain chronological order. */
function flattenMessagePages(data: MessagePages): MessageDto[] {
  const seen = new Set<string>();
  return [...data.pages]
    .reverse()
    .flat()
    .filter((message) => {
      if (seen.has(message.id)) return false;
      seen.add(message.id);
      return true;
    });
}

/** `GET /v1/conversations/:id/messages` — latest page first, older pages on demand; also marks the thread read server-side. */
export function useConversationMessages(conversationId: string | null) {
  const queryClient = useQueryClient();
  return useInfiniteQuery({
    queryKey: messagesKey(conversationId),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const query = new URLSearchParams({ limit: String(CHAT_MESSAGES_DEFAULT_LIMIT) });
      if (pageParam) query.set('before', pageParam);
      const messages = await apiFetch<MessageDto[]>(
        `/v1/conversations/${String(conversationId)}/messages?${query.toString()}`,
      );
      // Only the latest page marks the thread read on the server.
      if (!pageParam) {
        void queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY, exact: true });
      }
      return messages;
    },
    getNextPageParam: (lastPage) =>
      lastPage.length >= CHAT_MESSAGES_DEFAULT_LIMIT ? lastPage[0]?.id : undefined,
    select: flattenMessagePages,
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
    onSuccess: (message) => {
      // Put the acknowledged message on screen immediately; the refetch still
      // reconciles read receipts and any simultaneous incoming messages.
      queryClient.setQueryData<MessagePages>(messagesKey(conversationId), (current) => {
        if (!current) return current;
        const [latest = [], ...older] = current.pages;
        if (current.pages.some((page) => page.some((row) => row.id === message.id))) {
          return current;
        }
        return { ...current, pages: [[...latest, message], ...older] };
      });
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

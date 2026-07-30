import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { useLocalSearchParams } from 'expo-router';
import { color, space } from '@sc/tokens';
import { formatInHarare, type ConversationDto, type MessageDto } from '@sc/shared';
import { Screen, Text, Pressable, Avatar, Composer } from '@sc/ui';
import {
  useChatRealtime,
  useConversationMessages,
  useConversations,
  useSendMessage,
  useStartConversation,
} from '../../src/api/hooks/useChat.js';
import { useBack } from '../../src/navigation/useBack.js';

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.m },
  headerText: { flex: 1, minWidth: 0 },
  list: { flex: 1 },
  bubbleRow: { marginBottom: space.s },
  bubbleMine: { alignSelf: 'flex-end' },
  bubbleTheirs: { alignSelf: 'flex-start' },
  bubble: { maxWidth: '76%', borderRadius: 20, paddingVertical: 11, paddingHorizontal: 14 },
  bubbleFillMine: { backgroundColor: color.accent },
  bubbleFillTheirs: { backgroundColor: color.surface, borderWidth: 1, borderColor: color.divider },
  timestamp: { marginTop: 3 },
  timestampMine: { textAlign: 'right' },
  centreNote: { textAlign: 'center', marginBottom: space.l, marginTop: space.s },
});

/**
 * Chat (handoff screen 10). Reachable from a provider profile, a booking
 * row, Directions, or Trip — those call sites only know a providerId, so
 * they pass it as both `threadId` (expo-router's dynamic segment needs a
 * value) and the separate `providerId` param, which is what tells this
 * screen to resolve-or-create the real conversation via POST
 * /v1/conversations rather than treating `threadId` as a conversation id
 * directly. Messages' own inbox list passes a real conversation id with no
 * `providerId` param.
 */
export default function Chat() {
  const { threadId, providerId } = useLocalSearchParams<{
    threadId: string;
    providerId?: string;
  }>();
  const onBack = useBack('/(tabs)/messages');
  const startConversation = useStartConversation();
  const { data: conversations } = useConversations();
  const [resolvedConversation, setResolvedConversation] = useState<ConversationDto | null>(null);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (!providerId) return;
    startConversation.mutate(providerId, { onSuccess: setResolvedConversation });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- startConversation.mutate is stable; re-running only on a providerId change is intentional.
  }, [providerId]);

  const conversation =
    resolvedConversation ??
    (!providerId ? (conversations?.find((c) => c.id === threadId) ?? null) : null);
  const conversationId = conversation?.id ?? null;

  const { data: messages = [] } = useConversationMessages(conversationId);
  useChatRealtime(conversationId);
  const sendMessage = useSendMessage(conversationId);

  if (!threadId || !conversation) return null;

  const messagesNewestFirst = [...messages].reverse();

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    sendMessage.mutate({ text });
    setDraft('');
  };

  const renderMessage = ({ item }: { item: MessageDto }) => (
    <View style={[styles.bubbleRow, item.mine ? styles.bubbleMine : styles.bubbleTheirs]}>
      <View style={[styles.bubble, item.mine ? styles.bubbleFillMine : styles.bubbleFillTheirs]}>
        <Text variant="body" color={item.mine ? color.bg : color.text}>
          {item.text}
        </Text>
      </View>
      <Text
        variant="metaSmall"
        color="neutral600"
        style={[styles.timestamp, item.mine ? styles.timestampMine : null]}
      >
        {formatInHarare(item.createdAt, 'HH:mm')}
      </Text>
    </View>
  );

  return (
    <Screen
      scroll={false}
      header={
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack}>
            <ChevronLeft size={22} strokeWidth={1.9} color={color.text} />
          </Pressable>
          <Avatar initials={conversation.initials} tint={conversation.tint} size={30} />
          <View style={styles.headerText}>
            <Text variant="cardTitle" numberOfLines={1}>
              {conversation.counterpartyName}
            </Text>
            <Text variant="metaSmall" color="neutral600">
              Usually replies in minutes
            </Text>
          </View>
        </View>
      }
      footer={<Composer value={draft} onChange={setDraft} onSend={send} />}
    >
      <FlatList
        style={styles.list}
        data={messagesNewestFirst}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        inverted
        showsVerticalScrollIndicator={false}
        ListFooterComponent={
          <Text variant="metaSmall" color="neutral600" style={styles.centreNote}>
            Numbers and addresses stay in the app until you book.
          </Text>
        }
      />
    </Screen>
  );
}

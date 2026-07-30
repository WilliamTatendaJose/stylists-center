import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { useLocalSearchParams } from 'expo-router';
import { color, space } from '@sc/tokens';
import { formatInHarare, type MessageDto } from '@sc/shared';
import { Screen, Text, Pressable, Avatar, Composer } from '@sc/ui';
import { useChatStore } from '../../src/state/index.js';
import { PROVIDER_LIST } from '../../src/fixtures/index.js';
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

/** Chat (handoff screen 10). Reachable from a provider profile, a booking row, Directions, or Trip. */
export default function Chat() {
  const { threadId } = useLocalSearchParams<{ threadId: string }>();
  const onBack = useBack('/(tabs)/messages');

  const conversations = useChatStore((s) => s.conversations);
  const messagesByConversation = useChatStore((s) => s.messagesByConversation);
  const ensureConversation = useChatStore((s) => s.ensureConversation);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const [draft, setDraft] = useState('');

  const conversation = conversations.find((c) => c.id === threadId);

  // A "Message" tap from a provider whose thread the fixtures never seeded —
  // seed one from the provider's own record instead of dead-ending.
  useEffect(() => {
    if (!threadId || conversation) return;
    const provider = PROVIDER_LIST.find((p) => p.id === threadId);
    if (!provider) return;
    ensureConversation(threadId, {
      counterpartyName: provider.displayName,
      tint: provider.tint,
      initials: provider.initials,
    });
  }, [threadId, conversation, ensureConversation]);

  if (!threadId || !conversation) return null;

  const messages = messagesByConversation[threadId] ?? [];
  const messagesNewestFirst = [...messages].reverse();

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    sendMessage(threadId, text);
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

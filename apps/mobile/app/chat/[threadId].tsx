import { useEffect, useMemo, useState } from 'react';
import { Image, Linking, FlatList, Modal, StyleSheet, View } from 'react-native';
import { ChevronLeft, CheckCheck, FileText, Paperclip, Search, X } from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import type { DocumentPickerAsset } from 'expo-document-picker';
import { useLocalSearchParams } from 'expo-router';
import { radius, space } from '@sc/tokens';
import { formatInHarare, type ConversationDto, type MessageDto } from '@sc/shared';
import {
  Screen,
  Text,
  Pressable,
  Avatar,
  Composer,
  SearchField,
  ImagePlaceholder,
  useTheme,
} from '@sc/ui';
import {
  useChatRealtime,
  useConversationMessages,
  useConversations,
  useSendMessage,
  useStartConversation,
} from '../../src/api/hooks/useChat.js';
import { useBack } from '../../src/navigation/useBack.js';
import { describeError } from '../../src/api/errorMessage.js';
import { useMe } from '../../src/api/hooks/useMe.js';
import { apiAssetUrl } from '../../src/api/client.js';

const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const PICKER_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.m },
  headerText: { flex: 1, minWidth: 0 },
  headerAction: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  list: { flex: 1 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: space.s, marginBottom: space.m },
  composerWrap: { gap: space.s },
  attachmentQueue: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s },
  queuedFile: {
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingLeft: space.m,
    paddingRight: space.xs,
    paddingVertical: space.xs,
  },
  queuedName: { maxWidth: 220 },
  removeFile: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  attachButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubbleRow: { marginBottom: space.s },
  bubbleMine: { alignSelf: 'flex-end' },
  bubbleTheirs: { alignSelf: 'flex-start' },
  bubbleTheirsBorder: { borderWidth: 1 },
  bubble: {
    maxWidth: '82%',
    borderRadius: 20,
    paddingVertical: 11,
    paddingHorizontal: 14,
    gap: space.s,
  },
  attachmentCard: {
    minWidth: 190,
    maxWidth: 250,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s,
    borderRadius: radius.tile,
    padding: space.s,
  },
  attachmentImageCard: {
    minWidth: 0,
    maxWidth: 108,
    width: 108,
    flexDirection: 'column',
    alignItems: 'stretch',
    padding: space.xs,
    gap: space.xs,
  },
  attachmentText: { flex: 1, minWidth: 0 },
  attachmentImage: { width: 96, height: 64 },
  timestamp: { marginTop: 3 },
  receipt: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 3 },
  centreNote: { textAlign: 'center', marginBottom: space.l, marginTop: space.s },
  imageViewer: { flex: 1, padding: space.l, gap: space.m },
  viewerClose: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingVertical: space.s,
    paddingHorizontal: space.m,
  },
  viewerImage: { flex: 1, width: '100%' },
  viewerCaption: { textAlign: 'center' },
});

function formatFileSize(bytes: number | undefined): string {
  if (bytes === undefined) return '';
  if (bytes < 1024) return `${String(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Chat() {
  const { colors } = useTheme();
  const { threadId, providerId } = useLocalSearchParams<{
    threadId: string;
    providerId?: string;
  }>();
  const { data: me } = useMe();
  const onBack = useBack(
    me?.activeRole === 'provider' ? '/(provider)/messages' : '/(tabs)/messages',
  );
  const startConversation = useStartConversation();
  const { data: conversations } = useConversations();
  const [resolvedConversation, setResolvedConversation] = useState<ConversationDto | null>(null);
  const [draft, setDraft] = useState('');
  const [queuedAttachments, setQueuedAttachments] = useState<DocumentPickerAsset[]>([]);
  const [sendError, setSendError] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [messageQuery, setMessageQuery] = useState('');
  const [selectedImage, setSelectedImage] = useState<{ url: string; name: string } | null>(null);

  useEffect(() => {
    if (!providerId) return;
    startConversation.mutate(providerId, { onSuccess: setResolvedConversation });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mutate is stable; only provider changes resolve a new thread.
  }, [providerId]);

  const conversation =
    resolvedConversation ??
    (!providerId ? (conversations?.find((c) => c.id === threadId) ?? null) : null);
  const conversationId = conversation?.id ?? null;
  const { data: messages = [] } = useConversationMessages(conversationId);
  useChatRealtime(conversationId);
  const sendMessage = useSendMessage(conversationId);

  const visibleMessages = useMemo(() => {
    const query = messageQuery.trim().toLocaleLowerCase();
    const matching = query
      ? messages.filter((message) =>
          `${message.text} ${(message.attachments ?? []).map((file) => file.name).join(' ')}`
            .toLocaleLowerCase()
            .includes(query),
        )
      : messages;
    return [...matching].reverse();
  }, [messageQuery, messages]);

  if (!threadId || !conversation) return null;

  const pickAttachments = async () => {
    setSendError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: PICKER_TYPES,
        multiple: true,
        copyToCacheDirectory: true,
        base64: false,
      });
      if (result.canceled) return;
      const oversized = result.assets.find((asset) => (asset.size ?? 0) > MAX_ATTACHMENT_BYTES);
      if (oversized) {
        setSendError(`${oversized.name} is larger than 10 MB.`);
        return;
      }
      setQueuedAttachments((current) => {
        const unique = result.assets.filter(
          (asset) => !current.some((existing) => existing.uri === asset.uri),
        );
        const next = [...current, ...unique].slice(0, MAX_ATTACHMENTS);
        if (current.length + unique.length > MAX_ATTACHMENTS) {
          setSendError('You can attach up to 5 files to one message.');
        }
        return next;
      });
    } catch (error) {
      setSendError(describeError(error, "Couldn't open your files. Try again."));
    }
  };

  const send = () => {
    const text = draft.trim();
    if (!text && queuedAttachments.length === 0) return;

    const attachments = queuedAttachments;
    setSendError(null);
    setDraft('');
    setQueuedAttachments([]);
    sendMessage.mutate(
      { text, attachments },
      {
        onError: (error) => {
          setDraft((current) => (current === '' ? text : current));
          setQueuedAttachments((current) => (current.length === 0 ? attachments : current));
          setSendError(describeError(error, "That message didn't send. Try again."));
        },
      },
    );
  };

  const openAttachment = async (url: string) => {
    try {
      const resolved = apiAssetUrl(url);
      if (resolved) await Linking.openURL(resolved);
    } catch (error) {
      setSendError(describeError(error, "Couldn't open that attachment."));
    }
  };

  const renderMessage = ({ item }: { item: MessageDto }) => (
    <View style={[styles.bubbleRow, item.mine ? styles.bubbleMine : styles.bubbleTheirs]}>
      <View
        style={[
          styles.bubble,
          item.mine
            ? { backgroundColor: colors.accent }
            : [styles.bubbleTheirsBorder, { backgroundColor: colors.surface, borderColor: colors.divider }],
        ]}
      >
        {item.text ? (
          <Text variant="body" color={item.mine ? colors.bg : colors.text}>
            {item.text}
          </Text>
        ) : null}
        {(item.attachments ?? []).map((attachment) => {
          const image = attachment.mimeType.startsWith('image/');
          return (
            <Pressable
              key={attachment.id}
              accessibilityRole="link"
              accessibilityLabel={`Open attachment ${attachment.name}`}
              onPress={() => {
                if (image) {
                  const url = apiAssetUrl(attachment.url);
                  if (url) setSelectedImage({ url, name: attachment.name });
                  return;
                }
                void openAttachment(attachment.url);
              }}
              style={[
                styles.attachmentCard,
                item.mine
                  ? { backgroundColor: colors.onDark.border }
                  : { backgroundColor: colors.neutral200 },
                image ? styles.attachmentImageCard : null,
              ]}
            >
              {image ? (
                <ImagePlaceholder
                  uri={apiAssetUrl(attachment.url)}
                  label={attachment.name}
                  radius={12}
                  style={styles.attachmentImage}
                />
              ) : (
                <FileText size={24} strokeWidth={1.7} color={item.mine ? colors.bg : colors.text} />
              )}
              <View style={styles.attachmentText}>
                <Text variant="meta" color={item.mine ? colors.bg : colors.text} numberOfLines={1}>
                  {attachment.name}
                </Text>
                <Text variant="metaSmall" color={item.mine ? colors.bg : colors.neutral600}>
                  {formatFileSize(attachment.sizeBytes)} · Tap to open
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      {item.mine ? (
        <View style={styles.receipt}>
          <CheckCheck
            size={13}
            strokeWidth={1.8}
            color={item.read ? colors.accent700 : colors.neutral600}
          />
          <Text variant="metaSmall" color={item.read ? 'accent700' : 'neutral600'}>
            {formatInHarare(item.createdAt, 'HH:mm')} · {item.read ? 'Read' : 'Sent'}
          </Text>
        </View>
      ) : (
        <Text variant="metaSmall" color="neutral600" style={styles.timestamp}>
          {formatInHarare(item.createdAt, 'HH:mm')}
        </Text>
      )}
    </View>
  );

  return (
    <Screen
      scroll={false}
      header={
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack}>
            <ChevronLeft size={22} strokeWidth={1.9} color={colors.text} />
          </Pressable>
          <Avatar
            initials={conversation.initials}
            tint={conversation.tint}
            uri={apiAssetUrl(conversation.imageUrl)}
            size={34}
          />
          <View style={styles.headerText}>
            <Text variant="cardTitle" numberOfLines={1}>
              {conversation.counterpartyName}
            </Text>
            <Text variant="metaSmall" color="neutral600">
              {conversation.unreadCount > 0
                ? `${String(conversation.unreadCount)} unread`
                : 'Conversation'}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={searchOpen ? 'Close message search' : 'Search this conversation'}
            onPress={() => {
              setSearchOpen((current) => !current);
              if (searchOpen) setMessageQuery('');
            }}
            style={styles.headerAction}
          >
            {searchOpen ? (
              <X size={21} color={colors.text} />
            ) : (
              <Search size={21} color={colors.text} />
            )}
          </Pressable>
        </View>
      }
      footer={
        <View style={styles.composerWrap}>
          {queuedAttachments.length > 0 ? (
            <View style={styles.attachmentQueue}>
              {queuedAttachments.map((attachment) => (
                <View
                  key={attachment.uri}
                  style={[styles.queuedFile, { borderColor: colors.divider, backgroundColor: colors.surface }]}
                >
                  <Paperclip size={15} color={colors.neutral700} />
                  <Text variant="meta" numberOfLines={1} style={styles.queuedName}>
                    {attachment.name}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${attachment.name}`}
                    onPress={() =>
                      setQueuedAttachments((current) =>
                        current.filter((item) => item.uri !== attachment.uri),
                      )
                    }
                    style={styles.removeFile}
                  >
                    <X size={16} color={colors.neutral700} />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}
          {sendError ? (
            <Text
              variant="meta"
              color={colors.accent700}
              accessibilityLiveRegion="polite"
              accessibilityRole="alert"
            >
              {sendError}
            </Text>
          ) : null}
          <Composer
            value={draft}
            onChange={setDraft}
            onSend={send}
            disabled={sendMessage.isPending}
            canSendWithoutText={queuedAttachments.length > 0}
            leading={
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Attach files"
                disabled={sendMessage.isPending || queuedAttachments.length >= MAX_ATTACHMENTS}
                onPress={() => void pickAttachments()}
                style={[styles.attachButton, { borderColor: colors.divider }]}
              >
                <Paperclip size={20} strokeWidth={1.8} color={colors.text} />
              </Pressable>
            }
          />
        </View>
      }
    >
      {searchOpen ? (
        <View style={styles.searchWrap}>
          <SearchField
            placeholder="Search this conversation"
            value={messageQuery}
            onChangeText={setMessageQuery}
          />
          {messageQuery.trim() ? (
            <Text variant="meta" color="neutral600">
              {String(visibleMessages.length)} found
            </Text>
          ) : null}
        </View>
      ) : null}
      <FlatList
        style={styles.list}
        data={visibleMessages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        inverted
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <Text variant="meta" color="neutral600" align="center">
            {messageQuery.trim() ? 'No messages match your search.' : 'No messages yet. Say hello.'}
          </Text>
        }
        ListFooterComponent={
          <Text variant="metaSmall" color="neutral600" style={styles.centreNote}>
            Keep order details and collection updates here so both sides have the same record.
          </Text>
        }
      />
      <Modal
        visible={selectedImage !== null}
        animationType="fade"
        onRequestClose={() => setSelectedImage(null)}
      >
        <View style={[styles.imageViewer, { backgroundColor: colors.neutral900 }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close image"
            onPress={() => setSelectedImage(null)}
            onDark
            style={styles.viewerClose}
          >
            <X size={20} color={colors.bg} />
            <Text variant="meta" color={colors.bg}>
              Close
            </Text>
          </Pressable>
          {selectedImage ? (
            <Image
              source={{ uri: selectedImage.url }}
              accessibilityLabel={selectedImage.name}
              resizeMode="contain"
              style={styles.viewerImage}
            />
          ) : null}
          {selectedImage ? (
            <Text
              variant="meta"
              color={colors.onDark.body}
              style={styles.viewerCaption}
              numberOfLines={2}
            >
              {selectedImage.name}
            </Text>
          ) : null}
        </View>
      </Modal>
    </Screen>
  );
}

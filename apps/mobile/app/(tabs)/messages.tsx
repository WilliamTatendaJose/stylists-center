import { useMemo, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { formatBookingWhen } from '@sc/shared';
import { space } from '@sc/tokens';
import {
  Screen,
  ScreenHeader,
  ListRow,
  Badge,
  EmptyPanel,
  SearchField,
  SegmentedPills,
  useTheme,
} from '@sc/ui';
import { useConversations } from '../../src/api/hooks/useChat.js';
import { apiAssetUrl } from '../../src/api/client.js';
import { ServerConnectionPanel } from '../../src/components/ServerConnectionPanel.js';

type InboxFilter = 'all' | 'unread';

const styles = StyleSheet.create({
  controls: { gap: space.m, marginBottom: space.s },
  searchRow: { flexDirection: 'row' },
  unreadRow: {
    marginHorizontal: -space.s,
    paddingHorizontal: space.s,
  },
});

/** Searchable Messages inbox with an explicit unread queue. */
export default function Messages() {
  const { colors } = useTheme();
  const {
    data: conversations = [],
    isError,
    error,
    isLoading,
    isRefetching,
    refetch,
  } = useConversations();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<InboxFilter>('all');

  const sorted = useMemo(
    () => [...conversations].sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt)),
    [conversations],
  );
  const unreadTotal = conversations.reduce((total, row) => total + row.unreadCount, 0);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visible = sorted.filter((conversation) => {
    if (filter === 'unread' && conversation.unreadCount === 0) return false;
    if (!normalizedQuery) return true;
    return `${conversation.counterpartyName} ${conversation.lastMessagePreview}`
      .toLocaleLowerCase()
      .includes(normalizedQuery);
  });

  const emptyBody = normalizedQuery
    ? `No conversations match “${query.trim()}”.`
    : filter === 'unread'
      ? 'You’re all caught up — there are no unread messages.'
      : isLoading
        ? 'Loading your conversations…'
        : 'No conversations yet — message a stylist or buyer to start one.';

  return (
    <Screen
      hasTabBar
      header={
        <ScreenHeader
          title="Messages"
          showBack={false}
          right={
            unreadTotal > 0 ? <Badge label={`${String(unreadTotal)} unread`} tone="accent" /> : null
          }
        />
      }
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          tintColor={colors.accent}
          colors={[colors.accent]}
          onRefresh={() => void refetch()}
        />
      }
    >
      <View style={styles.controls}>
        <View style={styles.searchRow}>
          <SearchField
            placeholder="Search people or messages"
            value={query}
            onChangeText={setQuery}
          />
        </View>
        <SegmentedPills
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: `All (${String(conversations.length)})` },
            { value: 'unread', label: `Unread (${String(unreadTotal)})` },
          ]}
        />
      </View>

      {isError ? <ServerConnectionPanel error={error} onRetry={() => void refetch()} /> : null}

      {!isError && visible.length === 0 ? (
        <EmptyPanel body={emptyBody} />
      ) : (
        visible.map((conversation) => (
          <View
            key={conversation.id}
            style={
              conversation.unreadCount > 0
                ? [styles.unreadRow, { backgroundColor: colors.accent100 }]
                : undefined
            }
          >
            <ListRow
              avatar={{
                initials: conversation.initials,
                tint: conversation.tint,
                uri: apiAssetUrl(conversation.imageUrl),
                size: 48,
              }}
              title={conversation.counterpartyName}
              meta={conversation.lastMessagePreview || 'Say hello…'}
              rightCaption={formatBookingWhen(conversation.lastMessageAt)}
              right={
                conversation.unreadCount > 0 ? (
                  <Badge label={String(conversation.unreadCount)} tone="accent" />
                ) : null
              }
              onPress={() => {
                router.push({
                  pathname: '/chat/[threadId]',
                  params: { threadId: conversation.id },
                });
              }}
            />
          </View>
        ))
      )}
    </Screen>
  );
}

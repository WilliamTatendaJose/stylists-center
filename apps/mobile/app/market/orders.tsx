import { memo, useCallback, useMemo, useState } from 'react';
import { FlatList, Linking, RefreshControl, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { formatUsd, isOrderCompleted, ORDER_STATUS_LABELS, type OrderRowDto } from '@sc/shared';
import { space } from '@sc/tokens';
import {
  Screen,
  ScreenHeader,
  Text,
  Avatar,
  Badge,
  Button,
  Card,
  Sheet,
  EmptyPanel,
  TextField,
  useTheme,
} from '@sc/ui';
import {
  useCancelOrder,
  useCollectOrder,
  useMyOrders,
  useReviewProduct,
} from '../../src/api/hooks/useMarket.js';
import { useStartOrderConversation } from '../../src/api/hooks/useChat.js';
import { describeError } from '../../src/api/errorMessage.js';
import { useBack, useMarketHome } from '../../src/navigation/useBack.js';
import { apiAssetUrl } from '../../src/api/client.js';

const styles = StyleSheet.create({
  card: { padding: space.l, marginBottom: space.m },
  headerRow: { flexDirection: 'row', gap: space.m, alignItems: 'flex-start' },
  middle: { flex: 1, minWidth: 0 },
  meta: { marginTop: 2 },
  itemsBlock: { marginTop: space.m, gap: 2 },
  lifecycle: {
    marginTop: space.m,
    padding: space.m,
    borderRadius: 12,
  },
  actionsRow: { gap: space.s, marginTop: space.m },
  note: { marginBottom: space.m },
  historyTitle: { marginTop: space.l, marginBottom: space.m },
  sheetTitle: { marginBottom: space.s },
  sheetBody: { marginBottom: space.xl },
  sheetActions: { gap: space.s },
});

const ORDER_HISTORY_PREVIEW_COUNT = 2;

/** Still in progress: not handed over and not cancelled. */
const isActive = (order: OrderRowDto) =>
  order.status !== 'cancelled' && !isOrderCompleted(order.status);

function lifecycleText(order: OrderRowDto): string {
  if (order.status === 'reserved') return 'The shop is preparing your order.';
  if (order.status === 'out_for_delivery') {
    return 'On its way. Pay the shop when it arrives, then confirm once it is in your hands.';
  }
  return 'Ready to collect. Pay the shop and confirm only when the items are in your hands.';
}

interface OrderActions {
  onMessage: (order: OrderRowDto) => void;
  onCollect: (order: OrderRowDto) => void;
  onCancel: (order: OrderRowDto) => void;
  onReview: (order: OrderRowDto, item: OrderRowDto['items'][number]) => void;
}

interface OrderCardProps {
  order: OrderRowDto;
  /** True for the first history row, which carries the "Order history" label above it. */
  showHistoryTitle: boolean;
  messagePending: boolean;
  collectPending: boolean;
  actions: OrderActions;
}

const OrderCard = memo(function OrderCard({
  order,
  showHistoryTitle,
  messagePending,
  collectPending,
  actions,
}: OrderCardProps) {
  const { colors } = useTheme();
  return (
    <>
      {showHistoryTitle ? (
        <Text variant="sectionLabel" style={styles.historyTitle}>
          Order history
        </Text>
      ) : null}
      <Card bordered style={styles.card}>
        <View style={styles.headerRow}>
          <Avatar
            initials={order.initials}
            tint={order.tint}
            uri={apiAssetUrl(order.providerImageUrl)}
            size={44}
          />
          <View style={styles.middle}>
            <Text variant="cardTitle">{order.providerName}</Text>
            <Text variant="meta" color="neutral700" style={styles.meta}>
              {order.reference} · {order.areaName}
            </Text>
            <Text variant="metaSmall" color="neutral600">
              {order.paymentMethod === 'ecocash'
                ? 'Paid in the app'
                : `Pay the shop ${formatUsd(order.amountDueUsdCents)} on ${
                    order.fulfilment === 'delivery' ? 'delivery' : 'collection'
                  }`}
              {includedExtras(order)}
            </Text>
          </View>
          <Badge
            label={ORDER_STATUS_LABELS[order.status]}
            tone={isActive(order) ? 'accent' : 'neutral'}
          />
        </View>

        <View style={styles.itemsBlock}>
          {order.items.map((item) => (
            <View key={item.productId}>
              <Text variant="meta" color="neutral700">
                {item.quantity} × {item.name}
              </Text>
              {isOrderCompleted(order.status) && !item.reviewed ? (
                <Button
                  label={`Review ${item.name}`}
                  variant="ghost"
                  onPress={() => {
                    actions.onReview(order, item);
                  }}
                />
              ) : null}
            </View>
          ))}
        </View>

        {isActive(order) ? (
          <View style={[styles.lifecycle, { backgroundColor: colors.surface }]}>
            <Text variant="meta" color="neutral700">
              {lifecycleText(order)}
            </Text>
            {order.fulfilment === 'delivery' ? (
              <Text variant="meta" color="neutral700">
                Delivering to: {order.deliveryAddress}
              </Text>
            ) : (
              <>
                <Text variant="meta" color="neutral700">
                  Collect at: {order.pickupAddress}
                </Text>
                <Text variant="meta" color="neutral700">
                  Hours: {order.pickupHours}
                </Text>
              </>
            )}
            {order.pickupNote ? (
              <Text variant="meta" color="neutral700">
                Shop note: {order.pickupNote}
              </Text>
            ) : null}
            {order.fulfilment === 'collection' ? (
              <Button
                label="Open directions"
                variant="ghost"
                onPress={() => {
                  void Linking.openURL(
                    `https://www.google.com/maps/search/?api=1&query=${order.pickupLat},${order.pickupLng}`,
                  );
                }}
              />
            ) : null}
          </View>
        ) : null}

        {order.status !== 'cancelled' ? (
          <View style={styles.actionsRow}>
            <Button
              label={messagePending ? 'Opening…' : 'Message seller'}
              variant="secondary"
              block
              disabled={messagePending}
              onPress={() => {
                actions.onMessage(order);
              }}
            />
            {order.canCollect ? (
              <Button
                label={
                  collectPending
                    ? 'Confirming…'
                    : order.fulfilment === 'delivery'
                      ? "I've received it"
                      : "I've collected it"
                }
                block
                disabled={collectPending}
                onPress={() => {
                  actions.onCollect(order);
                }}
              />
            ) : null}
          </View>
        ) : null}
        {order.canCancel ? (
          <Button
            label="Cancel order"
            variant="ghost"
            block
            onPress={() => {
              actions.onCancel(order);
            }}
          />
        ) : null}
      </Card>
    </>
  );
});

interface OrderListItem {
  order: OrderRowDto;
  showHistoryTitle: boolean;
}

const keyExtractor = (item: OrderListItem) => item.order.id;

/** My orders — where to collect, and the two things a buyer can still do about it. */
/** " (includes $2.00 delivery and $0.30 service fee)" — what the amount to pay is made of. */
function includedExtras(order: OrderRowDto): string {
  const parts: string[] = [];
  if (order.deliveryChargeUsdCents > 0) {
    parts.push(`${formatUsd(order.deliveryChargeUsdCents)} delivery`);
  }
  if (order.serviceFeeUsdCents > 0) {
    parts.push(`${formatUsd(order.serviceFeeUsdCents)} service fee`);
  }
  return parts.length > 0 ? ` (includes ${parts.join(' and ')})` : '';
}

export default function Orders() {
  const { colors } = useTheme();
  const onBack = useBack(useMarketHome());
  const { data: orders = [], isError, isLoading, refetch, isRefetching } = useMyOrders();
  const collectOrder = useCollectOrder();
  const cancelOrder = useCancelOrder();
  const startConversation = useStartOrderConversation();
  const reviewProduct = useReviewProduct();

  const [actionError, setActionError] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<OrderRowDto | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [showAllOrderHistory, setShowAllOrderHistory] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<{
    orderId: string;
    productId: string;
    name: string;
  } | null>(null);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [reviewError, setReviewError] = useState<string | null>(null);
  const activeOrders = orders.filter(isActive);
  const orderHistory = orders.filter((order) => !isActive(order));
  const visibleOrderHistory = showAllOrderHistory
    ? orderHistory
    : orderHistory.slice(0, ORDER_HISTORY_PREVIEW_COUNT);
  const visibleOrders = [...activeOrders, ...visibleOrderHistory];

  const collectMutate = collectOrder.mutate;
  const startConversationMutate = startConversation.mutate;
  const collectPending = collectOrder.isPending;
  const messagePending = startConversation.isPending;

  const actions = useMemo<OrderActions>(
    () => ({
      onCollect: (order) => {
        setActionError(null);
        collectMutate(order.id, {
          onError: (error) => {
            setActionError(describeError(error, "Couldn't confirm that collection. Try again."));
          },
        });
      },
      onMessage: (order) => {
        setActionError(null);
        startConversationMutate(order.id, {
          onSuccess: (conversation) => {
            router.push({ pathname: '/chat/[threadId]', params: { threadId: conversation.id } });
          },
          onError: (error) => {
            setActionError(describeError(error, "Couldn't open your conversation. Try again."));
          },
        });
      },
      onCancel: (order) => {
        setCancelError(null);
        setCancelTarget(order);
      },
      onReview: (order, item) => {
        setReviewTarget({ orderId: order.id, productId: item.productId, name: item.name });
        setReviewRating(0);
        setReviewText('');
        setReviewError(null);
      },
    }),
    [collectMutate, startConversationMutate],
  );

  const listData = useMemo<OrderListItem[]>(
    () =>
      visibleOrders.map((order, index) => ({
        order,
        showHistoryTitle: index === activeOrders.length && orderHistory.length > 0,
      })),
    // visibleOrders is rebuilt every render; its inputs are `orders` and the history toggle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orders, showAllOrderHistory],
  );

  const renderItem = useCallback(
    ({ item }: { item: OrderListItem }) => (
      <OrderCard
        order={item.order}
        showHistoryTitle={item.showHistoryTitle}
        messagePending={messagePending}
        collectPending={collectPending}
        actions={actions}
      />
    ),
    [messagePending, collectPending, actions],
  );

  const listHeader = (
    <>
      {actionError ? (
        <Text
          variant="meta"
          color={colors.accent700}
          style={styles.note}
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
        >
          {actionError}
        </Text>
      ) : null}

      {isError && orders.length === 0 ? (
        <EmptyPanel
          title="Couldn't load your orders"
          body="Check your connection and pull down to try again."
        />
      ) : isError ? (
        <Text variant="meta" color="neutral700" style={styles.note}>
          Showing your last update — couldn&apos;t reach the server just now.
        </Text>
      ) : null}

      {orders.length > 0 && activeOrders.length === 0 ? (
        <EmptyPanel body="You have no active marketplace orders." />
      ) : null}
    </>
  );

  const listEmpty =
    orders.length === 0 && !isError ? (
      <EmptyPanel body={isLoading ? 'Loading your orders…' : "You haven't ordered anything yet."} />
    ) : null;

  const listFooter = (
    <>
      {orderHistory.length > ORDER_HISTORY_PREVIEW_COUNT ? (
        <Button
          label={
            showAllOrderHistory ? 'Show less' : `View all history (${String(orderHistory.length)})`
          }
          variant="ghost"
          block
          style={styles.note}
          onPress={() => {
            setShowAllOrderHistory((current) => !current);
          }}
        />
      ) : null}

      {activeOrders.some((o) => o.canCollect) ? (
        <Text variant="metaSmall" color="neutral600">
          Only confirm once you actually have the items. You pay the shop directly.
        </Text>
      ) : null}
    </>
  );

  const confirmCancel = () => {
    if (!cancelTarget) return;
    setCancelError(null);
    cancelOrder.mutate(cancelTarget.id, {
      onSuccess: () => {
        setCancelTarget(null);
      },
      onError: (error) => {
        setCancelError(describeError(error, "Couldn't cancel that order. Try again."));
      },
    });
  };

  return (
    <>
      <Screen
        header={<ScreenHeader title="My orders" onBack={onBack} />}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => {
              void refetch();
            }}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
        renderList={(listProps) => (
          <FlatList
            {...listProps}
            data={listData}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            ListHeaderComponent={listHeader}
            ListEmptyComponent={listEmpty}
            ListFooterComponent={listFooter}
          />
        )}
      />

      <Sheet
        open={!!cancelTarget}
        onClose={() => {
          setCancelTarget(null);
        }}
      >
        <Text variant="cardTitle" style={styles.sheetTitle}>
          Cancel this order?
        </Text>
        <Text variant="body" color="neutral700" style={styles.sheetBody}>
          {cancelTarget?.providerName} gets the stock back
          {cancelTarget?.paymentMethod === 'ecocash'
            ? ', and the amount held for it is refunded to you in full.'
            : cancelTarget && cancelTarget.coinsUsed > 0
              ? `, and your ${String(cancelTarget.coinsUsed)} coins are returned.`
              : '.'}
        </Text>

        {cancelError ? (
          <Text
            variant="meta"
            color={colors.accent700}
            style={styles.sheetBody}
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
          >
            {cancelError}
          </Text>
        ) : null}

        <View style={styles.sheetActions}>
          <Button
            label={cancelOrder.isPending ? 'Cancelling…' : 'Yes, cancel it'}
            block
            disabled={cancelOrder.isPending}
            onPress={confirmCancel}
          />
          <Button
            label="Keep the order"
            variant="ghost"
            block
            onPress={() => {
              setCancelTarget(null);
            }}
          />
        </View>
      </Sheet>
      <Sheet open={!!reviewTarget} onClose={() => setReviewTarget(null)}>
        <Text variant="cardTitle" style={styles.sheetTitle}>
          Review {reviewTarget?.name}
        </Text>
        <Text variant="meta" color="neutral700">
          Your review will help other buyers choose this product.
        </Text>
        <View style={styles.sheetActions}>
          {[1, 2, 3, 4, 5].map((rating) => (
            <Button
              key={rating}
              label={`${rating} star${rating === 1 ? '' : 's'}`}
              variant={reviewRating === rating ? 'primary' : 'secondary'}
              onPress={() => setReviewRating(rating)}
            />
          ))}
        </View>
        <TextField
          label="Your experience (optional)"
          value={reviewText}
          onChangeText={setReviewText}
          placeholder="How was the item?"
        />
        {reviewError ? (
          <Text variant="meta" color={colors.accent700}>
            {reviewError}
          </Text>
        ) : null}
        <Button
          label={reviewProduct.isPending ? 'Posting…' : 'Post review'}
          block
          disabled={!reviewTarget || reviewRating === 0 || reviewProduct.isPending}
          onPress={() => {
            if (!reviewTarget || !reviewRating) return;
            reviewProduct.mutate(
              {
                orderId: reviewTarget.orderId,
                productId: reviewTarget.productId,
                input: {
                  rating: reviewRating,
                  ...(reviewText.trim() ? { text: reviewText.trim() } : {}),
                },
              },
              {
                onSuccess: () => setReviewTarget(null),
                onError: (error) =>
                  setReviewError(describeError(error, "Couldn't post your review.")),
              },
            );
          }}
        />
      </Sheet>
    </>
  );
}

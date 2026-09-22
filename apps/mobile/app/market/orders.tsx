import { Fragment, useState } from 'react';
import { Linking, RefreshControl, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { formatUsd, ORDER_STATUS_LABELS, type OrderRowDto } from '@sc/shared';
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

/** My orders — where to collect, and the two things a buyer can still do about it. */
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
  const activeOrders = orders.filter(
    (order) => order.status === 'reserved' || order.status === 'ready_for_collection',
  );
  const orderHistory = orders.filter(
    (order) => order.status === 'collected' || order.status === 'cancelled',
  );
  const visibleOrderHistory = showAllOrderHistory
    ? orderHistory
    : orderHistory.slice(0, ORDER_HISTORY_PREVIEW_COUNT);
  const visibleOrders = [...activeOrders, ...visibleOrderHistory];

  const confirmCollect = (order: OrderRowDto) => {
    setActionError(null);
    collectOrder.mutate(order.id, {
      onError: (error) => {
        setActionError(describeError(error, "Couldn't confirm that collection. Try again."));
      },
    });
  };

  const messageSeller = (order: OrderRowDto) => {
    setActionError(null);
    startConversation.mutate(order.id, {
      onSuccess: (conversation) => {
        router.push({ pathname: '/chat/[threadId]', params: { threadId: conversation.id } });
      },
      onError: (error) => {
        setActionError(describeError(error, "Couldn't open your conversation. Try again."));
      },
    });
  };

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
      >
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

        {orders.length === 0 && !isError ? (
          <EmptyPanel
            body={isLoading ? 'Loading your orders…' : "You haven't ordered anything yet."}
          />
        ) : null}

        {orders.length > 0 && activeOrders.length === 0 ? (
          <EmptyPanel body="You have no active marketplace orders." />
        ) : null}

        {visibleOrders.map((order, index) => (
          <Fragment key={order.id}>
            {index === activeOrders.length && orderHistory.length > 0 ? (
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
                    {order.paymentMethod === 'ecocash' ? 'EcoCash — paid' : 'Cash on collection'} ·{' '}
                    {formatUsd(order.totalUsdCents)}
                  </Text>
                </View>
                <Badge
                  label={ORDER_STATUS_LABELS[order.status]}
                  tone={
                    order.status === 'reserved' || order.status === 'ready_for_collection'
                      ? 'accent'
                      : 'neutral'
                  }
                />
              </View>

              <View style={styles.itemsBlock}>
                {order.items.map((item) => (
                  <View key={item.productId}>
                    <Text variant="meta" color="neutral700">
                      {item.quantity} × {item.name}
                    </Text>
                    {order.status === 'collected' && !item.reviewed ? (
                      <Button
                        label={`Review ${item.name}`}
                        variant="ghost"
                        onPress={() => {
                          setReviewTarget({
                            orderId: order.id,
                            productId: item.productId,
                            name: item.name,
                          });
                          setReviewRating(0);
                          setReviewText('');
                          setReviewError(null);
                        }}
                      />
                    ) : null}
                  </View>
                ))}
              </View>

              {order.status === 'reserved' || order.status === 'ready_for_collection' ? (
                <View style={[styles.lifecycle, { backgroundColor: colors.surface }]}>
                  <Text variant="meta" color="neutral700">
                    {order.status === 'reserved'
                      ? 'The seller is preparing your order.'
                      : 'Ready to collect. Confirm only when the items are in your hands.'}
                  </Text>
                  <Text variant="meta" color="neutral700">
                    Collect at: {order.pickupAddress}
                  </Text>
                  <Text variant="meta" color="neutral700">
                    Hours: {order.pickupHours}
                  </Text>
                  {order.pickupNote ? (
                    <Text variant="meta" color="neutral700">
                      Seller note: {order.pickupNote}
                    </Text>
                  ) : null}
                  <Button
                    label="Open directions"
                    variant="ghost"
                    onPress={() => {
                      void Linking.openURL(
                        `https://www.google.com/maps/search/?api=1&query=${order.pickupLat},${order.pickupLng}`,
                      );
                    }}
                  />
                </View>
              ) : null}

              {order.status !== 'cancelled' ? (
                <View style={styles.actionsRow}>
                  <Button
                    label={startConversation.isPending ? 'Opening…' : 'Message seller'}
                    variant="secondary"
                    block
                    disabled={startConversation.isPending}
                    onPress={() => {
                      messageSeller(order);
                    }}
                  />
                  {order.canCollect ? (
                    <Button
                      label={collectOrder.isPending ? 'Confirming…' : "I've collected it"}
                      block
                      disabled={collectOrder.isPending}
                      onPress={() => {
                        confirmCollect(order);
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
                    setCancelError(null);
                    setCancelTarget(order);
                  }}
                />
              ) : null}
            </Card>
          </Fragment>
        ))}

        {orderHistory.length > ORDER_HISTORY_PREVIEW_COUNT ? (
          <Button
            label={
              showAllOrderHistory
                ? 'Show less'
                : `View all history (${String(orderHistory.length)})`
            }
            variant="ghost"
            block
            style={styles.note}
            onPress={() => {
              setShowAllOrderHistory((current) => !current);
            }}
          />
        ) : null}

        {activeOrders.some((o) => o.status === 'ready_for_collection') ? (
          <Text variant="metaSmall" color="neutral600">
            Confirming collection is what releases payment to the stylist, so only tap it once you
            actually have the items.
          </Text>
        ) : null}
      </Screen>

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

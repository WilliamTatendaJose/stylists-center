import { useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { formatUsd, ORDER_STATUS_LABELS, type OrderRowDto } from '@sc/shared';
import { color, space } from '@sc/tokens';
import { Screen, ScreenHeader, Text, Avatar, Badge, Button, Card, Sheet, EmptyPanel } from '@sc/ui';
import { useCancelOrder, useCollectOrder, useMyOrders } from '../../src/api/hooks/useMarket.js';
import { describeError } from '../../src/api/errorMessage.js';
import { useBack } from '../../src/navigation/useBack.js';

const styles = StyleSheet.create({
  card: { padding: space.l, marginBottom: space.m },
  headerRow: { flexDirection: 'row', gap: space.m, alignItems: 'flex-start' },
  middle: { flex: 1, minWidth: 0 },
  meta: { marginTop: 2 },
  itemsBlock: { marginTop: space.m, gap: 2 },
  actionsRow: { flexDirection: 'row', gap: space.s, marginTop: space.m },
  actionButton: { flex: 1 },
  note: { marginBottom: space.m },
  sheetTitle: { marginBottom: space.s },
  sheetBody: { marginBottom: space.xl },
  sheetActions: { gap: space.s },
});

/** My orders — where to collect, and the two things a buyer can still do about it. */
export default function Orders() {
  const onBack = useBack('/(tabs)/market');
  const { data: orders = [], isError, isLoading, refetch, isRefetching } = useMyOrders();
  const collectOrder = useCollectOrder();
  const cancelOrder = useCancelOrder();

  const [actionError, setActionError] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<OrderRowDto | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const confirmCollect = (order: OrderRowDto) => {
    setActionError(null);
    collectOrder.mutate(order.id, {
      onError: (error) => {
        setActionError(describeError(error, "Couldn't confirm that collection. Try again."));
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
            tintColor={color.accent}
            colors={[color.accent]}
          />
        }
      >
        {actionError ? (
          <Text
            variant="meta"
            color={color.accent700}
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

        {orders.map((order) => (
          <Card key={order.id} bordered style={styles.card}>
            <View style={styles.headerRow}>
              <Avatar initials={order.initials} tint={order.tint} size={44} />
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
                tone={order.status === 'reserved' ? 'accent' : 'neutral'}
              />
            </View>

            <View style={styles.itemsBlock}>
              {order.items.map((item) => (
                <Text key={item.productId} variant="meta" color="neutral700">
                  {item.quantity} × {item.name}
                </Text>
              ))}
            </View>

            {order.canCollect || order.canCancel ? (
              <View style={styles.actionsRow}>
                {order.canCollect ? (
                  <Button
                    label={collectOrder.isPending ? 'Confirming…' : "I've collected it"}
                    style={styles.actionButton}
                    disabled={collectOrder.isPending}
                    onPress={() => {
                      confirmCollect(order);
                    }}
                  />
                ) : null}
                {order.canCancel ? (
                  <Button
                    label="Cancel"
                    variant="ghost"
                    style={styles.actionButton}
                    onPress={() => {
                      setCancelError(null);
                      setCancelTarget(order);
                    }}
                  />
                ) : null}
              </View>
            ) : null}
          </Card>
        ))}

        {orders.some((o) => o.status === 'reserved') ? (
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
            color={color.accent700}
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
    </>
  );
}

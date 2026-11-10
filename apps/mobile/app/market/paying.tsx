import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  formatUsd,
  PAY_CHANNEL_LABELS,
  payChannelSchema,
  paymentActionSchema,
  type PaymentAction,
} from '@sc/shared';
import { space } from '@sc/tokens';
import { Screen, Text, Button, Badge, Card, useTheme } from '@sc/ui';
import { isTerminalOrderPayment, useOrderPaymentStatus } from '../../src/api/hooks/useMarket.js';
import { PaymentActionPanel } from '../../src/components/PaymentActionPanel.js';

const POLL_TIMEOUT_MS = 90_000;
/** InnBucks and O'mari need the buyer to switch apps or read an SMS, which takes longer than a prompt. */
const ACTION_POLL_TIMEOUT_MS = 5 * 60_000;
const SUCCESS = new Set(['held', 'paid', 'released']);

const styles = StyleSheet.create({
  head: { alignItems: 'center', paddingTop: space.xl, marginBottom: space.xl },
  spinner: { marginBottom: space.l },
  title: { marginBottom: space.s, textAlign: 'center' },
  intro: { textAlign: 'center' },
  orderCard: { padding: space.l, marginBottom: space.s },
  orderTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  orderCopy: { flex: 1, minWidth: 0 },
  orderMeta: { marginTop: 2 },
  orderAction: { marginTop: space.m },
});

interface PendingOrder {
  id: string;
  reference: string;
  providerName: string;
  totalUsdCents: number;
  requiresHostedCheckout?: boolean;
  /** An InnBucks code or O'mari OTP step for this order's own payment. */
  action?: PaymentAction;
}

function parseOrders(raw: string | undefined): PendingOrder[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (o): o is PendingOrder =>
          !!o &&
          typeof o === 'object' &&
          typeof (o as PendingOrder).id === 'string' &&
          typeof (o as PendingOrder).reference === 'string' &&
          typeof (o as PendingOrder).providerName === 'string' &&
          typeof (o as PendingOrder).totalUsdCents === 'number',
      )
      .map((o) => {
        // Route params are untrusted text; an action that does not parse is
        // dropped rather than rendered half-formed.
        const action = paymentActionSchema.safeParse(o.action);
        const order: PendingOrder = {
          id: o.id,
          reference: o.reference,
          providerName: o.providerName,
          totalUsdCents: o.totalUsdCents,
          ...(o.requiresHostedCheckout ? { requiresHostedCheckout: true } : {}),
        };
        return action.success ? { ...order, action: action.data } : order;
      });
  } catch {
    // A malformed param degrades to "nothing to wait for" rather than a crash;
    // the effect below then sends the user somewhere useful.
    return [];
  }
}

/** One order's row — its own poll, so a two-seller checkout settles independently. */
function OrderStatusRow({
  order,
  enabled,
  blocked,
  onStatus,
}: {
  order: PendingOrder;
  enabled: boolean;
  blocked: boolean;
  onStatus: (orderId: string, status: string) => void;
}) {
  const { data } = useOrderPaymentStatus(order.id, enabled);
  const status = data?.status;

  useEffect(() => {
    if (status) onStatus(order.id, status);
  }, [status, order.id, onStatus]);

  const paid = status ? SUCCESS.has(status) : false;
  const settled = isTerminalOrderPayment(status);
  const showAction = Boolean(order.action) && enabled && !blocked && !settled;

  return (
    <Card bordered style={styles.orderCard}>
      <View style={styles.orderTop}>
        <View style={styles.orderCopy}>
          <Text variant="bodyStrong">{order.providerName}</Text>
          <Text variant="metaSmall" color="neutral600" style={styles.orderMeta}>
            {order.reference} · {formatUsd(order.totalUsdCents)}
          </Text>
        </View>
        <Badge
          label={paid ? 'Paid' : blocked || settled ? 'Not paid' : 'Waiting'}
          tone={paid ? 'accent100' : 'neutral'}
        />
      </View>
      {showAction && order.action ? (
        <View style={styles.orderAction}>
          <PaymentActionPanel action={order.action} reference={order.reference} />
        </View>
      ) : null}
    </Card>
  );
}

/**
 * Shown after the in-app marketplace checkout pushes an EcoCash prompt. It
 * waits for each order's real result and only then calls the checkout done.
 */
export default function MarketPaying() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{
    orders?: string;
    instructions?: string;
    remainingCount?: string;
    payChannel?: string;
  }>();
  const orders = useMemo(() => parseOrders(params.orders), [params.orders]);
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [timedOut, setTimedOut] = useState(false);
  const hostedFallback = orders.some((order) => order.requiresHostedCheckout);
  const remainingCount = Number(params.remainingCount ?? 0);
  const parsedChannel = payChannelSchema.safeParse(params.payChannel);
  const channelLabel = PAY_CHANNEL_LABELS[parsedChannel.success ? parsedChannel.data : 'ecocash'];
  const hasAction = orders.some((order) => order.action);

  const onStatus = useCallback((orderId: string, status: string) => {
    setStatuses((prev) => (prev[orderId] === status ? prev : { ...prev, [orderId]: status }));
  }, []);

  useEffect(() => {
    if (orders.length === 0) router.replace('/market/orders');
  }, [orders.length]);

  useEffect(() => {
    const timer = setTimeout(
      () => setTimedOut(true),
      hasAction ? ACTION_POLL_TIMEOUT_MS : POLL_TIMEOUT_MS,
    );
    return () => clearTimeout(timer);
  }, [hasAction]);

  const allSettled =
    orders.length > 0 && orders.every((o) => isTerminalOrderPayment(statuses[o.id]));
  const allPaid = orders.length > 0 && orders.every((o) => SUCCESS.has(statuses[o.id] ?? ''));

  if (orders.length === 0) return null;

  const done = hostedFallback || timedOut || allSettled;
  const goOrders = () => router.replace('/market/orders');
  // Not auto-forwarded on success — see the note in book/paying.tsx: the
  // confirmed result is the thing worth showing, so it takes a deliberate tap.
  const goDone = () => {
    router.replace({
      pathname: '/market/done',
      params: {
        orders: JSON.stringify(
          orders.map((o) => ({
            reference: o.reference,
            providerName: o.providerName,
            totalUsdCents: o.totalUsdCents,
          })),
        ),
        ...(remainingCount > 0 ? { remainingCount: String(remainingCount) } : {}),
      },
    });
  };

  return (
    <Screen
      hasTabBar={false}
      footer={
        allPaid ? (
          <Button label="Continue" block size="lg" arrow onPress={goDone} />
        ) : done ? (
          <Button label="See my orders" block onPress={goOrders} />
        ) : undefined
      }
    >
      <View style={styles.head}>
        {done ? null : (
          <ActivityIndicator size="large" color={colors.accent} style={styles.spinner} />
        )}
        <Text variant="h3" style={styles.title}>
          {hostedFallback
            ? 'In-app payment unavailable'
            : allPaid
              ? 'Payment confirmed'
              : allSettled
                ? 'Some payments did not go through'
                : timedOut
                  ? 'Still waiting for payment'
                  : hasAction
                    ? `Finish paying with ${channelLabel}`
                    : 'Check your phone'}
        </Text>
        <Text variant="body" color="neutral700" style={styles.intro}>
          {hostedFallback
            ? `Your order is reserved but unpaid because the in-app ${channelLabel} payment could not be started. Open My orders to cancel it, then try again with another number or wallet.`
            : allPaid
              ? `Your in-app ${orders.length > 1 ? 'payments were' : 'payment was'} confirmed. Bring the order number when you collect.`
              : allSettled
                ? "Anything marked 'Not paid' is still reserved but unpaid — you can settle it on collection, or cancel it from My orders."
                : timedOut
                  ? "This is taking longer than expected. Your orders are on file — we'll update them as soon as the payment is confirmed."
                  : hasAction
                    ? orders.length > 1
                      ? 'Each order below is paid separately. Complete the step under each one.'
                      : (params.instructions ?? 'Complete the step below to pay for this order.')
                    : (params.instructions ??
                      `Approve the ${channelLabel} prompt on your phone to pay for these orders.`)}
        </Text>
      </View>

      {orders.map((order) => (
        <OrderStatusRow
          key={order.id}
          order={order}
          enabled={!timedOut && !hostedFallback}
          blocked={Boolean(order.requiresHostedCheckout)}
          onStatus={onStatus}
        />
      ))}
      {remainingCount > 0 ? (
        <View>
          <Text variant="meta" color="neutral700">
            {remainingCount} seller {remainingCount === 1 ? 'order could not' : 'orders could not'}{' '}
            be placed. Those items are still in your cart.
          </Text>
          <Button
            label="Review remaining cart"
            variant="secondary"
            onPress={() => router.replace('/market/cart')}
          />
        </View>
      ) : null}
    </Screen>
  );
}

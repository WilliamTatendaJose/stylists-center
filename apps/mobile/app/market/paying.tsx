import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { formatUsd } from '@sc/shared';
import { space } from '@sc/tokens';
import { Screen, Text, Button, Badge, Card, useTheme } from '@sc/ui';
import { isTerminalOrderPayment, useOrderPaymentStatus } from '../../src/api/hooks/useMarket.js';

const POLL_TIMEOUT_MS = 90_000;
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
});

interface PendingOrder {
  id: string;
  reference: string;
  providerName: string;
  totalUsdCents: number;
  checkoutUrl?: string;
}

function parseOrders(raw: string | undefined): PendingOrder[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (o): o is PendingOrder =>
        !!o &&
        typeof o === 'object' &&
        typeof (o as PendingOrder).id === 'string' &&
        typeof (o as PendingOrder).reference === 'string' &&
        typeof (o as PendingOrder).providerName === 'string' &&
        typeof (o as PendingOrder).totalUsdCents === 'number',
    );
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
  onStatus,
}: {
  order: PendingOrder;
  enabled: boolean;
  onStatus: (orderId: string, status: string) => void;
}) {
  const { data } = useOrderPaymentStatus(order.id, enabled);
  const status = data?.status;

  useEffect(() => {
    if (status) onStatus(order.id, status);
  }, [status, order.id, onStatus]);

  const paid = status ? SUCCESS.has(status) : false;
  const settled = isTerminalOrderPayment(status);

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
          label={paid ? 'Paid' : settled ? 'Not paid' : 'Waiting'}
          tone={paid ? 'accent100' : 'neutral'}
        />
      </View>
    </Card>
  );
}

/**
 * Shown after Paynow pushes an EcoCash prompt for a market checkout. The cart
 * used to jump straight to "Reserved for you" the moment the browser closed,
 * which claimed the order was paid for when nothing had been confirmed. This
 * waits for each order's real result and only then calls it done.
 */
export default function MarketPaying() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ orders?: string; instructions?: string }>();
  const orders = useMemo(() => parseOrders(params.orders), [params.orders]);
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [timedOut, setTimedOut] = useState(false);
  const openedCheckouts = useRef(new Set<string>());

  const onStatus = useCallback((orderId: string, status: string) => {
    setStatuses((prev) => (prev[orderId] === status ? prev : { ...prev, [orderId]: status }));
  }, []);

  useEffect(() => {
    if (orders.length === 0) router.replace('/market/orders');
  }, [orders.length]);

  useEffect(() => {
    const openBrowsers = async () => {
      for (const order of orders) {
        if (order.checkoutUrl && !openedCheckouts.current.has(order.id)) {
          openedCheckouts.current.add(order.id);
          await WebBrowser.openBrowserAsync(order.checkoutUrl);
        }
      }
    };
    void openBrowsers();
  }, [orders]);

  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), POLL_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  const allSettled =
    orders.length > 0 && orders.every((o) => isTerminalOrderPayment(statuses[o.id]));
  const allPaid = orders.length > 0 && orders.every((o) => SUCCESS.has(statuses[o.id] ?? ''));

  if (orders.length === 0) return null;

  const done = timedOut || allSettled;
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
      },
    });
  };

  return (
    <Screen
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
          {allPaid
            ? 'Payment confirmed'
            : allSettled
              ? 'Some payments did not go through'
              : timedOut
                ? 'Still waiting on EcoCash'
                : 'Check your phone'}
        </Text>
        <Text variant="body" color="neutral700" style={styles.intro}>
          {allPaid
            ? `Paynow confirmed ${orders.length > 1 ? 'these payments' : 'this payment'}. Bring the order number when you collect.`
            : allSettled
              ? "Anything marked 'Not paid' is still reserved but unpaid — you can settle it on collection, or cancel it from My orders."
              : timedOut
                ? "This is taking longer than expected. Your orders are on file — we'll update them as soon as Paynow confirms."
                : (params.instructions ??
                  'Approve the EcoCash prompt on your phone to pay for these orders.')}
        </Text>
      </View>

      {orders.map((order) => (
        <OrderStatusRow key={order.id} order={order} enabled={!timedOut} onStatus={onStatus} />
      ))}
    </Screen>
  );
}

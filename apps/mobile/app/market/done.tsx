import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Check } from 'lucide-react-native';
import { formatUsd } from '@sc/shared';
import { color, space } from '@sc/tokens';
import { Screen, Text, Button, RuleList } from '@sc/ui';
import { useMarketHome } from '../../src/navigation/useBack.js';

const styles = StyleSheet.create({
  circle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: color.onAccent.text,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.l,
  },
  title: { marginBottom: space.s },
  body: { marginBottom: space.xl },
  summary: { marginBottom: space.l },
  actions: { gap: space.s, marginTop: space.l },
});

interface PlacedOrder {
  reference: string;
  providerName: string;
  /** What the buyer pays the shop on receipt. */
  amountDueUsdCents: number;
  /** Included in amountDueUsdCents; absent on links from before the fee was shown. */
  serviceFeeUsdCents?: number;
  fulfilment: 'collection' | 'delivery';
}

function parseOrders(raw: string | undefined): PlacedOrder[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (o): o is PlacedOrder =>
        !!o &&
        typeof o === 'object' &&
        typeof (o as PlacedOrder).reference === 'string' &&
        typeof (o as PlacedOrder).providerName === 'string' &&
        typeof (o as PlacedOrder).amountDueUsdCents === 'number',
    );
  } catch {
    // A malformed or absent param degrades to an empty list, not a crash —
    // this screen still has somewhere useful to send the user (My orders).
    return [];
  }
}

/**
 * Order(s) placed (handoff screen 18, full accent — mirrors the booking Done
 * screen). A checkout can place more than one order at once now that a cart
 * may span sellers, so this reads a JSON-encoded list rather than one
 * reference/providerName/total triple.
 */
export default function OrderDone() {
  const { orders: ordersParam, remainingCount: remainingCountParam } = useLocalSearchParams<{
    orders?: string;
    remainingCount?: string;
  }>();
  const marketHome = useMarketHome();
  const orders = parseOrders(ordersParam);
  const grandTotal = orders.reduce((sum, o) => sum + o.amountDueUsdCents, 0);
  const multi = orders.length > 1;
  const remainingCount = Number(remainingCountParam ?? 0);

  return (
    <Screen theme="accent">
      <View style={styles.circle}>
        <Check size={32} strokeWidth={2} color={color.onAccent.text} />
      </View>

      <Text variant="h2Small" color={color.onAccent.text} style={styles.title}>
        Order placed.
      </Text>
      <Text variant="body" color={color.onAccent.labelDim} style={styles.body}>
        {multi
          ? `${String(orders.length)} shops are holding these for you. Pay each shop when you collect or receive your order.`
          : `${orders[0]?.providerName ?? 'The shop'} is holding this for you. Pay the shop when you ${orders[0]?.fulfilment === 'delivery' ? 'receive' : 'collect'} your order.`}
      </Text>

      {orders.map((order) => (
        <View key={order.reference} style={styles.summary}>
          <RuleList
            onAccent
            items={[
              { label: 'Order', value: order.reference },
              {
                label: order.fulfilment === 'delivery' ? 'Delivered by' : 'Collect from',
                value: order.providerName,
              },
              ...(order.serviceFeeUsdCents
                ? [{ label: 'Service fee', value: formatUsd(order.serviceFeeUsdCents) }]
                : []),
              { label: 'Pay on receipt', value: formatUsd(order.amountDueUsdCents) },
            ]}
          />
        </View>
      ))}

      {multi ? (
        <RuleList onAccent items={[{ label: 'Total to pay', value: formatUsd(grandTotal) }]} />
      ) : null}

      <View style={styles.actions}>
        {remainingCount > 0 ? (
          <>
            <Text variant="body" color={color.onAccent.text}>
              {remainingCount} seller{' '}
              {remainingCount === 1 ? 'order could not' : 'orders could not'} be placed. Those items
              are still in your cart.
            </Text>
            <Button
              label="Review remaining cart"
              variant="whiteOnAccent"
              block
              onPress={() => router.replace('/market/cart')}
            />
          </>
        ) : null}
        <Button
          label="See my orders"
          variant="whiteOnAccent"
          size="lg"
          block
          arrow
          onPress={() => {
            // `replace`: checkout is finished, so neither the cart nor this
            // screen should sit behind the user in the stack.
            router.replace('/market/orders');
          }}
        />
        <Button
          label="Back to market"
          variant="outlineOnAccent"
          size="lg"
          block
          onPress={() => {
            router.replace(marketHome);
          }}
        />
      </View>
    </Screen>
  );
}

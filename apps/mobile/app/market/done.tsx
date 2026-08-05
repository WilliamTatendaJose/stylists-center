import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Check } from 'lucide-react-native';
import { formatUsd } from '@sc/shared';
import { color, space } from '@sc/tokens';
import { Screen, Text, Button, RuleList } from '@sc/ui';

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
  totalUsdCents: number;
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
        typeof (o as PlacedOrder).totalUsdCents === 'number',
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
  const { orders: ordersParam } = useLocalSearchParams<{ orders?: string }>();
  const orders = parseOrders(ordersParam);
  const grandTotal = orders.reduce((sum, o) => sum + o.totalUsdCents, 0);
  const multi = orders.length > 1;

  return (
    <Screen theme="accent">
      <View style={styles.circle}>
        <Check size={32} strokeWidth={2} color={color.onAccent.text} />
      </View>

      <Text variant="h2Small" color={color.onAccent.text} style={styles.title}>
        Reserved for you.
      </Text>
      <Text variant="body" color={color.onAccent.labelDim} style={styles.body}>
        {multi
          ? `${String(orders.length)} stylists are holding these for you. Bring the order number when you collect from each.`
          : `${orders[0]?.providerName ?? 'The stylist'} is holding these for you. Bring your order number when you collect.`}
      </Text>

      {orders.map((order) => (
        <View key={order.reference} style={styles.summary}>
          <RuleList
            onAccent
            items={[
              { label: 'Order', value: order.reference },
              { label: 'Collect from', value: order.providerName },
              { label: 'Total', value: formatUsd(order.totalUsdCents) },
            ]}
          />
        </View>
      ))}

      {multi ? (
        <RuleList onAccent items={[{ label: 'Grand total', value: formatUsd(grandTotal) }]} />
      ) : null}

      <View style={styles.actions}>
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
            router.replace('/(tabs)/market');
          }}
        />
      </View>
    </Screen>
  );
}

import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Minus, Plus, Trash2 } from 'lucide-react-native';
import { formatUsd, type CreateOrderResponse, type PaymentMethod } from '@sc/shared';
import { color, space } from '@sc/tokens';
import {
  Screen,
  ScreenHeader,
  Text,
  Pressable,
  Button,
  Card,
  RadioCard,
  RuleList,
  EmptyPanel,
} from '@sc/ui';
import { useCreateOrder } from '../../src/api/hooks/useMarket.js';
import {
  cartTotalUsdCents,
  groupCartBySeller,
  useCartStore,
  type CartGroup,
} from '../../src/state/index.js';
import { describeError } from '../../src/api/errorMessage.js';
import { useBack } from '../../src/navigation/useBack.js';

const styles = StyleSheet.create({
  sellerBlock: { marginBottom: space.xl },
  sellerLabel: { marginBottom: space.m },
  sellerError: { marginBottom: space.s },
  lineCard: { padding: space.l, marginBottom: space.s },
  lineTop: { flexDirection: 'row', alignItems: 'flex-start', gap: space.m },
  lineText: { flex: 1, minWidth: 0 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: space.m, marginTop: space.m },
  qtyButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: color.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyValue: { minWidth: 22, textAlign: 'center' },
  removeButton: { marginLeft: 'auto' },
  section: { marginTop: space.xl, marginBottom: space.l },
  sectionLabel: { marginBottom: space.m },
  radioGap: { marginBottom: space.s },
  footer: { gap: space.s },
});

/**
 * Cart and checkout (handoff screen 17).
 *
 * A cart can hold items from more than one seller — collection still only
 * ever happens at one place, so checkout places one order PER seller, not
 * one order for the whole cart. The two are different things: "everything
 * I want to buy" (the cart) versus "one trip to one stylist" (an order).
 * Conflating them was what made adding a second stylist's item look like it
 * deleted the first — it was silently replacing the entire cart.
 */
export default function Cart() {
  const onBack = useBack('/(tabs)/market');
  const lines = useCartStore((s) => s.lines);
  const setQuantity = useCartStore((s) => s.setQuantity);
  const remove = useCartStore((s) => s.remove);
  const removeSeller = useCartStore((s) => s.removeSeller);
  const clear = useCartStore((s) => s.clear);

  const createOrder = useCreateOrder();
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('ecocash');
  const [submitting, setSubmitting] = useState(false);
  const [sellerErrors, setSellerErrors] = useState<Record<string, string>>({});

  const groups = groupCartBySeller(lines);
  const total = cartTotalUsdCents(lines);

  if (groups.length === 0) {
    return (
      <Screen header={<ScreenHeader title="Cart" onBack={onBack} />}>
        <EmptyPanel
          title="Your cart is empty"
          body="Add something from the market and it'll show up here."
        />
      </Screen>
    );
  }

  /**
   * Fires one order per seller group and settles independently: the
   * realistic failure is stock going for one item while the cart sat open,
   * and that must not also block a different seller's order that was fine.
   * Only groups that failed stay in the cart afterwards, ready to retry.
   */
  const placeOrders = async () => {
    setSellerErrors({});
    setSubmitting(true);

    const settled = await Promise.allSettled(
      groups.map((group): Promise<{ group: CartGroup; created: CreateOrderResponse }> =>
        createOrder
          .mutateAsync({
            providerId: group.providerId,
            paymentMethod,
            items: group.lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
          })
          .then((created) => ({ group, created })),
      ),
    );

    setSubmitting(false);

    const succeeded: { group: CartGroup; created: CreateOrderResponse }[] = [];
    const nextErrors: Record<string, string> = {};

    settled.forEach((result, index) => {
      const group = groups[index];
      if (!group) return;
      if (result.status === 'fulfilled') {
        succeeded.push(result.value);
      } else {
        nextErrors[group.providerId] = describeError(
          result.reason,
          `Couldn't place your order with ${group.providerName}.`,
        );
      }
    });

    for (const { group } of succeeded) {
      removeSeller(group.providerId);
    }

    if (Object.keys(nextErrors).length > 0) {
      // At least one seller failed: stay here. The cart now shows only the
      // sellers still pending, each with its own error, ready to retry —
      // re-fetching this same screen re-derives `groups` from what is left.
      setSellerErrors(nextErrors);
      return;
    }

    clear();
    router.replace({
      pathname: '/market/done',
      params: {
        orders: JSON.stringify(
          succeeded.map(({ group, created }) => ({
            reference: created.reference,
            providerName: group.providerName,
            totalUsdCents: created.totalUsdCents,
          })),
        ),
      },
    });
  };

  return (
    <Screen
      header={<ScreenHeader title="Cart" onBack={onBack} />}
      footer={
        <View style={styles.footer}>
          <Button
            label={
              submitting
                ? 'Placing order…'
                : groups.length > 1
                  ? `Pay ${formatUsd(total)} — ${String(groups.length)} orders`
                  : paymentMethod === 'ecocash'
                    ? `Pay ${formatUsd(total)} with EcoCash`
                    : `Reserve — pay ${formatUsd(total)} on collection`
            }
            block
            size="lg"
            arrow
            disabled={submitting}
            onPress={() => {
              void placeOrders();
            }}
          />
        </View>
      }
    >
      {groups.map((group) => (
        <View key={group.providerId} style={styles.sellerBlock}>
          <Text variant="meta" color="neutral700" style={styles.sellerLabel}>
            Collecting from {group.providerName}
          </Text>

          {sellerErrors[group.providerId] ? (
            <Text
              variant="meta"
              color={color.accent700}
              style={styles.sellerError}
              accessibilityLiveRegion="polite"
              accessibilityRole="alert"
            >
              {sellerErrors[group.providerId]}
            </Text>
          ) : null}

          {group.lines.map((line) => (
            <Card key={line.productId} bordered style={styles.lineCard}>
              <View style={styles.lineTop}>
                <View style={styles.lineText}>
                  <Text variant="cardTitle">{line.name}</Text>
                  <Text variant="meta" color="neutral700">
                    {formatUsd(line.priceUsdCents)} each
                  </Text>
                </View>
                <Text variant="bodyStrong">{formatUsd(line.priceUsdCents * line.quantity)}</Text>
              </View>

              <View style={styles.qtyRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Fewer ${line.name}`}
                  onPress={() => {
                    setQuantity(line.productId, line.quantity - 1);
                  }}
                  style={styles.qtyButton}
                >
                  <Minus size={16} strokeWidth={1.9} color={color.text} />
                </Pressable>
                <Text variant="bodyStrong" style={styles.qtyValue}>
                  {line.quantity}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`More ${line.name}`}
                  // Capped at what the seller actually had when this was
                  // added; the server re-checks under a lock at checkout
                  // regardless.
                  disabled={line.quantity >= line.stockQty}
                  onPress={() => {
                    setQuantity(line.productId, line.quantity + 1);
                  }}
                  style={styles.qtyButton}
                >
                  <Plus size={16} strokeWidth={1.9} color={color.text} />
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${line.name}`}
                  onPress={() => {
                    remove(line.productId);
                  }}
                  style={styles.removeButton}
                >
                  <Trash2 size={18} strokeWidth={1.7} color={color.neutral700} />
                </Pressable>
              </View>
            </Card>
          ))}
        </View>
      ))}

      <View style={styles.section}>
        <Text variant="sectionLabel" style={styles.sectionLabel}>
          How you&apos;ll pay
        </Text>
        <Text variant="metaSmall" color="neutral600" style={styles.sellerLabel}>
          {groups.length > 1
            ? 'Applies to every order in this checkout.'
            : 'Applies to this order.'}
        </Text>
        <View style={styles.radioGap}>
          <RadioCard
            title="EcoCash — pay now"
            description="Held until you collect. Refunded in full if you cancel."
            dot
            selected={paymentMethod === 'ecocash'}
            onPress={() => {
              setPaymentMethod('ecocash');
            }}
          />
        </View>
        <RadioCard
          title="Cash — pay on collection"
          description="Reserved for you now, settled when you pick it up."
          dot
          selected={paymentMethod === 'cash'}
          onPress={() => {
            setPaymentMethod('cash');
          }}
        />
      </View>

      <RuleList
        items={[
          { label: 'Items', value: String(lines.reduce((n, l) => n + l.quantity, 0)) },
          {
            label: groups.length > 1 ? 'Orders' : 'Collect from',
            value: groups.length > 1 ? String(groups.length) : (groups[0]?.providerName ?? ''),
          },
          { label: 'Total', value: formatUsd(total) },
        ]}
      />
    </Screen>
  );
}

import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Minus, Plus, Trash2 } from 'lucide-react-native';
import {
  formatUsd,
  coinsToCover,
  coinsToPayInFull,
  orderAmountDueUsdCents,
  orderServiceFeeUsdCents,
  type CreateOrderResponse,
  type FulfilmentMethod,
} from '@sc/shared';
import { space } from '@sc/tokens';
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
  TextField,
  useTheme,
} from '@sc/ui';
import { useCreateOrder, useDeliveryQuotes } from '../../src/api/hooks/useMarket.js';
import { useAppConfig } from '../../src/api/hooks/useAppConfig.js';
import { useWallet } from '../../src/api/hooks/useWallet.js';
import {
  cartTotalUsdCents,
  groupCartBySeller,
  useCartStore,
  useLocationPickerStore,
  type CartGroup,
} from '../../src/state/index.js';

const DELIVERY_POINT_PURPOSE = 'market-delivery';
import { describeError } from '../../src/api/errorMessage.js';
import { useBack, useMarketHome } from '../../src/navigation/useBack.js';

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
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyValue: { minWidth: 22, textAlign: 'center' },
  removeButton: { marginLeft: 'auto' },
  section: { marginTop: space.l, marginBottom: space.l },
  sectionLabel: { marginBottom: space.m },
  fulfilment: { marginTop: space.m, gap: space.s },
  footer: { gap: space.s },
});

/**
 * A short, stable tag for the choices that change what an order is. The
 * server treats a checkout key as one specific request, so the same cart
 * checked out as delivery instead of collection must be a different key, or
 * the second attempt would be refused as "changed".
 */
function variantTag(parts: (string | number)[]): string {
  const text = parts.join('|');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return hash.toString(36);
}

/**
 * Cart and checkout (handoff screen 17).
 *
 * A cart can hold items from more than one seller — collection still only
 * ever happens at one place, so checkout places one order PER seller, not
 * one order for the whole cart. The two are different things: "everything
 * I want to buy" (the cart) versus "one trip to one shop" (an order).
 *
 * Nothing is paid here: the buyer pays each shop in cash or their own mobile
 * money when they collect or receive the goods. Coins are the one thing that
 * moves in the app, as a discount the shop is paid back for.
 */
/** "Deliver to me — $1.50 (3 km)" once quoted, otherwise the rate per km. */
function deliveryTitle(
  group: CartGroup,
  quote: { chargeUsdCents: number; distanceKm: number } | null,
): string {
  if (quote) {
    return `Deliver to me — ${formatUsd(quote.chargeUsdCents)} (${String(quote.distanceKm)} km)`;
  }
  return group.deliveryPerKmUsdCents > 0
    ? `Deliver to me — ${formatUsd(group.deliveryPerKmUsdCents)} per km`
    : 'Deliver to me — charged per km';
}

export default function Cart() {
  const { colors } = useTheme();
  const onBack = useBack(useMarketHome());
  const lines = useCartStore((s) => s.lines);
  const setQuantity = useCartStore((s) => s.setQuantity);
  const remove = useCartStore((s) => s.remove);
  const removeSeller = useCartStore((s) => s.removeSeller);
  const clear = useCartStore((s) => s.clear);
  const getCheckoutKey = useCartStore((s) => s.getCheckoutKey);

  const createOrder = useCreateOrder();
  const { data: wallet } = useWallet();
  const [methods, setMethods] = useState<Record<string, FulfilmentMethod>>({});
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [addressError, setAddressError] = useState<string | null>(null);
  const [useCoins, setUseCoins] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sellerErrors, setSellerErrors] = useState<Record<string, string>>({});

  const groups = groupCartBySeller(lines);
  const productTotal = cartTotalUsdCents(lines);
  const methodFor = (group: CartGroup): FulfilmentMethod =>
    group.delivers && methods[group.providerId] === 'delivery' ? 'delivery' : 'collection';
  const needsAddress = groups.some((g) => methodFor(g) === 'delivery');

  // Delivery is charged per km from each shop to this point, picked on the
  // map (type the address, then move the pin onto the gate).
  const [deliveryPoint, setDeliveryPoint] = useState<{ lat: number; lng: number } | null>(null);
  const pickedLocation = useLocationPickerStore((s) => s.result);
  const clearPickedLocation = useLocationPickerStore((s) => s.clearResult);
  useEffect(() => {
    if (pickedLocation?.purpose !== DELIVERY_POINT_PURPOSE) return;
    setDeliveryPoint({ lat: pickedLocation.lat, lng: pickedLocation.lng });
    if (pickedLocation.areaName) {
      setDeliveryAddress((typed) => typed.trim() || pickedLocation.areaName || '');
    }
    setAddressError(null);
    clearPickedLocation();
  }, [pickedLocation, clearPickedLocation]);
  const deliveringIds = groups.filter((g) => g.delivers).map((g) => g.providerId);
  const quoteResults = useDeliveryQuotes(deliveringIds, deliveryPoint);
  const quoteFor = (providerId: string) =>
    quoteResults[deliveringIds.indexOf(providerId)]?.data ?? null;
  const openDeliveryMap = () => {
    router.push({
      pathname: '/map/pick-location',
      params: {
        purpose: DELIVERY_POINT_PURPOSE,
        ...(deliveryAddress.trim() ? { q: deliveryAddress.trim() } : {}),
        ...(deliveryPoint
          ? { lat: String(deliveryPoint.lat), lng: String(deliveryPoint.lng) }
          : {}),
      },
    });
  };

  // Coins pay for whole orders only, never part of one: shop by shop, an
  // order is paid with coins if the balance left covers all of it. The
  // server enforces the same rule.
  // Only spendable coins (not expired, not agent earnings) can pay for an order.
  const coinsAvailable = wallet?.spendableCoins ?? 0;
  // The marketplace commission, shown as a service fee when the buyer pays
  // it (console setting). The server works it out the same way.
  const {
    marketplaceFeeBps,
    marketplaceFeePaidBy,
    coinUsdCents: configCoinUsdCents,
  } = useAppConfig();
  const coinUsdCents = wallet?.coinUsdCents ?? configCoinUsdCents;
  const planWith = (startingCoins: number) => {
    let coinsLeft = startingCoins;
    return groups.map((group) => {
      const fulfilment = methodFor(group);
      const products = group.lines.reduce((n, l) => n + l.priceUsdCents * l.quantity, 0);
      // Unknown (0) until the delivery point is picked and quoted.
      const delivery =
        fulfilment === 'delivery' ? (quoteFor(group.providerId)?.chargeUsdCents ?? 0) : 0;
      const serviceFee = orderServiceFeeUsdCents(products, marketplaceFeeBps, marketplaceFeePaidBy);
      const orderAmount = products + delivery + serviceFee;
      const coins = coinsToPayInFull(orderAmount, coinUsdCents, coinsLeft);
      coinsLeft -= coins;
      const coinsValue = coins > 0 ? orderAmount : 0;
      return {
        group,
        fulfilment,
        delivery,
        serviceFee,
        coins,
        coinsValue,
        due: orderAmountDueUsdCents({
          productTotalUsdCents: products,
          deliveryChargeUsdCents: delivery,
          coinsValueUsdCents: coinsValue,
          serviceFeeUsdCents: serviceFee,
        }),
      };
    });
  };
  const plan = planWith(useCoins ? coinsAvailable : 0);
  // Whether the coins could pay for at least one whole order.
  const coinsCoverAnOrder = planWith(coinsAvailable).some((p) => p.coins > 0);
  // Coins the cheapest order would take, to say how far off the balance is.
  const coinsForCheapestOrder = Math.min(
    ...planWith(0).map((p) => coinsToCover(p.due, coinUsdCents)),
  );
  const totalDue = plan.reduce((n, p) => n + p.due, 0);
  const totalDelivery = plan.reduce((n, p) => n + p.delivery, 0);
  const totalServiceFee = plan.reduce((n, p) => n + p.serviceFee, 0);
  const totalCoinsValue = plan.reduce((n, p) => n + p.coinsValue, 0);

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
    // Catch a missing address before placing anything: these orders consume stock.
    if (needsAddress && deliveryAddress.trim().length < 5) {
      setAddressError('Enter where to deliver.');
      return;
    }
    if (needsAddress && !deliveryPoint) {
      setAddressError('Pick the delivery point on the map, so delivery can be charged per km.');
      return;
    }
    if (
      needsAddress &&
      plan.some((p) => p.fulfilment === 'delivery' && !quoteFor(p.group.providerId))
    ) {
      setAddressError('Working out the delivery charge. Try again in a moment.');
      return;
    }
    setAddressError(null);
    setSellerErrors({});
    setSubmitting(true);

    const settled = await Promise.allSettled(
      plan.map(
        ({
          group,
          fulfilment,
          coins,
        }): Promise<{ group: CartGroup; created: CreateOrderResponse; fulfilment: string }> =>
          createOrder
            .mutateAsync({
              providerId: group.providerId,
              checkoutKey: `${getCheckoutKey(group.providerId)}-${variantTag([
                fulfilment,
                fulfilment === 'delivery' ? deliveryAddress.trim() : '',
                fulfilment === 'delivery' && deliveryPoint
                  ? `${deliveryPoint.lat.toFixed(5)},${deliveryPoint.lng.toFixed(5)}`
                  : '',
                coins,
              ])}`,
              fulfilment,
              ...(fulfilment === 'delivery' && deliveryPoint
                ? {
                    deliveryAddress: deliveryAddress.trim(),
                    deliveryLat: deliveryPoint.lat,
                    deliveryLng: deliveryPoint.lng,
                  }
                : {}),
              ...(coins > 0 ? { coins } : {}),
              items: group.lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
            })
            .then((created) => ({ group, created, fulfilment })),
      ),
    );

    setSubmitting(false);

    const succeeded: { group: CartGroup; created: CreateOrderResponse; fulfilment: string }[] = [];
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

    const remainingCount = Object.keys(nextErrors).length;
    if (remainingCount > 0 && succeeded.length === 0) {
      setSellerErrors(nextErrors);
      return;
    }
    if (remainingCount === 0) clear();

    router.replace({
      pathname: '/market/done',
      params: {
        orders: JSON.stringify(
          succeeded.map(({ group, created, fulfilment }) => ({
            reference: created.reference,
            providerName: group.providerName,
            amountDueUsdCents: created.amountDueUsdCents,
            serviceFeeUsdCents: created.serviceFeeUsdCents,
            fulfilment,
          })),
        ),
        ...(remainingCount ? { remainingCount: String(remainingCount) } : {}),
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
                  ? `Place ${String(groups.length)} orders — pay ${formatUsd(totalDue)} on receipt`
                  : `Place order — pay ${formatUsd(totalDue)} on receipt`
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
      {plan.map(({ group, fulfilment, delivery, serviceFee, coins, due }) => (
        <View key={group.providerId} style={styles.sellerBlock}>
          <Text variant="meta" color="neutral700" style={styles.sellerLabel}>
            From {group.providerName}
          </Text>

          {sellerErrors[group.providerId] ? (
            <Text
              variant="meta"
              color={colors.accent700}
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
                  <Minus size={16} strokeWidth={1.9} color={colors.text} />
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
                  <Plus size={16} strokeWidth={1.9} color={colors.text} />
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${line.name}`}
                  onPress={() => {
                    remove(line.productId);
                  }}
                  style={styles.removeButton}
                >
                  <Trash2 size={18} strokeWidth={1.7} color={colors.neutral700} />
                </Pressable>
              </View>
            </Card>
          ))}

          <View style={styles.fulfilment}>
            <RadioCard
              title="I'll collect it"
              description="Pick it up from the shop when it is ready."
              dot
              selected={fulfilment === 'collection'}
              onPress={() => {
                setMethods((current) => ({ ...current, [group.providerId]: 'collection' }));
              }}
            />
            {group.delivers ? (
              <RadioCard
                title={deliveryTitle(group, quoteFor(group.providerId))}
                description="The shop brings it to your address. Charged per km from the shop."
                dot
                selected={fulfilment === 'delivery'}
                onPress={() => {
                  setMethods((current) => ({ ...current, [group.providerId]: 'delivery' }));
                }}
              />
            ) : (
              <Text variant="metaSmall" color="neutral600">
                This shop does not deliver.
              </Text>
            )}
          </View>
          <Text variant="meta" color="neutral700" style={styles.fulfilment}>
            {delivery > 0 ? `Delivery ${formatUsd(delivery)} · ` : ''}
            {serviceFee > 0 ? `Service fee ${formatUsd(serviceFee)} · ` : ''}
            {coins > 0 ? `${String(coins)} coins used · ` : ''}
            Pay {group.providerName} {formatUsd(due)}
          </Text>
        </View>
      ))}

      {needsAddress ? (
        <View style={styles.section}>
          <TextField
            label="Delivery address"
            value={deliveryAddress}
            onChangeText={(value) => {
              setDeliveryAddress(value);
              setAddressError(null);
            }}
            placeholder="House number, street and suburb"
          />
          <Button
            label={deliveryPoint ? 'Move the delivery point' : 'Pick the delivery point on the map'}
            variant="secondary"
            onPress={openDeliveryMap}
          />
          <Text variant="metaSmall" color="neutral600">
            {deliveryPoint
              ? 'Delivery point set. Delivery is charged per km from the shop to it.'
              : 'Delivery is charged per km from the shop, so set where it should go.'}
          </Text>
          {addressError ? (
            <Text
              variant="meta"
              color={colors.accent700}
              accessibilityLiveRegion="polite"
              accessibilityRole="alert"
            >
              {addressError}
            </Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.section}>
        <Text variant="sectionLabel" style={styles.sectionLabel}>
          How you&apos;ll pay
        </Text>
        <Text variant="body" color="neutral700" style={styles.sectionLabel}>
          You pay each shop directly, in cash or from your own mobile money, when you collect or
          receive your order. Nothing is charged in the app.
        </Text>
        {coinsCoverAnOrder ? (
          <RadioCard
            title={`Pay with coins (${String(coinsAvailable)} available)`}
            description={
              groups.length > 1
                ? 'Coins pay for whole orders only: each order your coins fully cover is paid with coins, the rest in cash. The shop is credited the coins.'
                : 'Pays for the whole order, so there is nothing to pay the shop. The shop is credited the coins.'
            }
            dot
            selected={useCoins}
            onPress={() => {
              setUseCoins((current) => !current);
            }}
          />
        ) : Number.isFinite(coinsForCheapestOrder) && coinsForCheapestOrder > 0 ? (
          // Always mentioned, so people know coins can pay for an order.
          <Text variant="body" color="neutral700" style={styles.sectionLabel}>
            Pay with coins: {groups.length > 1 ? 'your cheapest order takes' : 'this order takes'}{' '}
            {coinsForCheapestOrder} coins and you have {coinsAvailable}. Coins pay for whole orders
            only.
          </Text>
        ) : null}
      </View>

      <RuleList
        items={[
          { label: 'Items', value: String(lines.reduce((n, l) => n + l.quantity, 0)) },
          {
            label: groups.length > 1 ? 'Orders' : 'From',
            value: groups.length > 1 ? String(groups.length) : (groups[0]?.providerName ?? ''),
          },
          { label: 'Products', value: formatUsd(productTotal) },
          ...(totalDelivery > 0 ? [{ label: 'Delivery', value: formatUsd(totalDelivery) }] : []),
          ...(totalServiceFee > 0
            ? [{ label: 'Service fee', value: formatUsd(totalServiceFee) }]
            : []),
          ...(totalCoinsValue > 0
            ? [{ label: 'Coins', value: `-${formatUsd(totalCoinsValue)}` }]
            : []),
          { label: 'To pay on receipt', value: formatUsd(totalDue) },
        ]}
      />
    </Screen>
  );
}

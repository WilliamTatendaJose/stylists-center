import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Package, ShoppingBag } from 'lucide-react-native';
import { formatUsd } from '@sc/shared';
import { color, space } from '@sc/tokens';
import {
  Badge,
  Button,
  Card,
  EmptyPanel,
  Pressable,
  Screen,
  ScreenHeader,
  SegmentedPills,
  Text,
  TextField,
} from '@sc/ui';
import {
  useCreateProviderProduct,
  useProviderCollectOrder,
  useProviderOrders,
  useProviderProducts,
} from '../../src/api/hooks/useMarket.js';
import { describeError } from '../../src/api/errorMessage.js';
import { MarketBrowse } from '../../src/components/MarketBrowse.js';
import { cartItemCount, useCartStore } from '../../src/state/index.js';

const styles = StyleSheet.create({
  toggle: { marginBottom: space.xxl },
  section: { marginBottom: space.xxl },
  title: { marginBottom: space.m },
  card: { padding: space.l, marginBottom: space.m },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: space.m,
  },
  grow: { flex: 1, minWidth: 0 },
  meta: { marginTop: 2 },
  field: { marginBottom: space.m },
  error: { marginBottom: space.m },
  action: { marginTop: space.m },
  headerActions: { flexDirection: 'row', gap: space.s },
  cartButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: color.neutral900,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ordersButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: color.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartCount: { position: 'absolute', top: -4, right: -6 },
});

type ShopMode = 'buy' | 'sell';

/**
 * A stylist is also a marketplace buyer — they run out of the same braiding
 * hair or polish another seller has in stock. Before this, Shop only ever
 * showed the provider's own inventory: there was no way to browse or order
 * from anyone else without switching to a client account. "Buy" reuses the
 * exact same catalogue the client Market tab shows (MarketBrowse); "Sell" is
 * this account's own storefront management, unchanged.
 */
export default function ProviderShop() {
  const [mode, setMode] = useState<ShopMode>('sell');
  const lines = useCartStore((s) => s.lines);
  const itemCount = cartItemCount(lines);

  const { data: products, isError: productsError } = useProviderProducts();
  const { data: orders, isError: ordersError } = useProviderOrders();
  const createProduct = useCreateProviderProduct();
  const collectOrder = useProviderCollectOrder();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('1');
  const [error, setError] = useState<string | null>(null);

  const canAdd =
    name.trim().length >= 2 &&
    description.trim().length >= 2 &&
    Number(price) >= 1 &&
    Number(stock) >= 0 &&
    !createProduct.isPending;

  const addProduct = () => {
    if (!canAdd) return;
    setError(null);
    createProduct.mutate(
      {
        name: name.trim(),
        description: description.trim(),
        priceUsdCents: Math.round(Number(price) * 100),
        stockQty: Math.floor(Number(stock)),
        imageUrls: [],
      },
      {
        onSuccess: () => {
          setName('');
          setDescription('');
          setPrice('');
          setStock('1');
        },
        onError: (reason) => setError(describeError(reason, "Couldn't add that item.")),
      },
    );
  };

  return (
    <Screen
      hasTabBar
      header={
        <ScreenHeader
          title="Shop"
          showBack={false}
          right={
            mode === 'buy' ? (
              <View style={styles.headerActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="My orders"
                  onPress={() => {
                    router.push('/market/orders');
                  }}
                  style={styles.ordersButton}
                >
                  <Package size={18} strokeWidth={1.7} color={color.text} />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    itemCount > 0 ? `Cart, ${String(itemCount)} items` : 'Cart, empty'
                  }
                  onPress={() => {
                    router.push('/market/cart');
                  }}
                  style={styles.cartButton}
                >
                  <ShoppingBag size={18} strokeWidth={1.7} color={color.bg} />
                  {itemCount > 0 ? (
                    <View style={styles.cartCount}>
                      <Badge label={String(itemCount)} tone="accent" size="sm" />
                    </View>
                  ) : null}
                </Pressable>
              </View>
            ) : undefined
          }
        />
      }
    >
      <View style={styles.toggle}>
        <SegmentedPills
          options={[
            { value: 'sell', label: 'Sell' },
            { value: 'buy', label: 'Buy' },
          ]}
          value={mode}
          onChange={setMode}
        />
      </View>

      {mode === 'buy' ? (
        <MarketBrowse />
      ) : (
        <>
          {error ? (
            <Text variant="meta" color={color.accent700} style={styles.error}>
              {error}
            </Text>
          ) : null}

          <View style={styles.section}>
            <Text variant="sectionLabel" style={styles.title}>
              Incoming orders
            </Text>
            {ordersError ? <EmptyPanel body="Couldn't load incoming orders." /> : null}
            {orders?.length === 0 ? (
              <EmptyPanel body="New marketplace orders will appear here." />
            ) : null}
            {orders?.map((order) => (
              <Card bordered key={order.id} style={styles.card}>
                <View style={styles.row}>
                  <View style={styles.grow}>
                    <Text variant="cardTitle">{order.buyerName}</Text>
                    <Text variant="meta" color="neutral700" style={styles.meta}>
                      {order.reference} · {order.paymentMethod === 'ecocash' ? 'Paynow' : 'Cash'}
                    </Text>
                  </View>
                  <Badge
                    label={order.status}
                    tone={order.status === 'reserved' ? 'accent' : 'neutral'}
                  />
                </View>
                {order.items.map((item) => (
                  <Text key={item.productId} variant="meta" color="neutral700">
                    {item.quantity} × {item.name}
                  </Text>
                ))}
                <Text variant="bodyStrong" style={styles.action}>
                  {formatUsd(order.totalUsdCents)}
                </Text>
                {order.canMarkCollected ? (
                  <Button
                    label={collectOrder.isPending ? 'Updating…' : 'Mark collected'}
                    block
                    style={styles.action}
                    disabled={collectOrder.isPending}
                    onPress={() =>
                      collectOrder.mutate(order.id, {
                        onError: (reason) =>
                          setError(describeError(reason, "Couldn't update that order.")),
                      })
                    }
                  />
                ) : null}
              </Card>
            ))}
          </View>

          <View style={styles.section}>
            <Text variant="sectionLabel" style={styles.title}>
              Your inventory
            </Text>
            {productsError ? <EmptyPanel body="Couldn't load your marketplace items." /> : null}
            {products?.map((product) => (
              <Card bordered key={product.id} style={styles.card}>
                <View style={styles.row}>
                  <View style={styles.grow}>
                    <Text variant="bodyStrong">{product.name}</Text>
                    <Text variant="meta" color="neutral700">
                      {product.stockQty} in stock
                    </Text>
                  </View>
                  <Text variant="bodyStrong">{formatUsd(product.priceUsdCents)}</Text>
                </View>
              </Card>
            ))}

            <View style={[styles.field, { marginTop: space.m }]}>
              <TextField
                label="Item name"
                value={name}
                onChangeText={setName}
                placeholder="e.g. Braiding hair"
              />
            </View>
            <View style={styles.field}>
              <TextField
                label="Description"
                value={description}
                onChangeText={setDescription}
                placeholder="What buyers should know"
              />
            </View>
            <View style={styles.row}>
              <View style={styles.grow}>
                <TextField
                  label="Price (USD)"
                  value={price}
                  onChangeText={setPrice}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.grow}>
                <TextField
                  label="Stock"
                  value={stock}
                  onChangeText={setStock}
                  keyboardType="number-pad"
                />
              </View>
            </View>
            <Button
              label={createProduct.isPending ? 'Adding…' : 'Add to marketplace'}
              block
              style={styles.action}
              disabled={!canAdd}
              onPress={addProduct}
            />
          </View>
        </>
      )}
    </Screen>
  );
}

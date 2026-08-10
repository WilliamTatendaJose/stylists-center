import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { formatUsd } from '@sc/shared';
import { color, space } from '@sc/tokens';
import { Badge, Button, Card, EmptyPanel, Screen, ScreenHeader, Text, TextField } from '@sc/ui';
import {
  useCreateProviderProduct,
  useProviderCollectOrder,
  useProviderOrders,
  useProviderProducts,
} from '../../src/api/hooks/useMarket.js';
import { describeError } from '../../src/api/errorMessage.js';

const styles = StyleSheet.create({
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
});

export default function ProviderShop() {
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
    <Screen hasTabBar header={<ScreenHeader title="Shop" showBack={false} />}>
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
          disabled={!canAdd}
          onPress={addProduct}
        />
      </View>
    </Screen>
  );
}

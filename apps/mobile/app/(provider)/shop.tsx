import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Package, ShoppingBag } from 'lucide-react-native';
import { formatUsd, ORDER_STATUS_LABELS } from '@sc/shared';
import { color, space } from '@sc/tokens';
import {
  Badge,
  Button,
  Card,
  EmptyPanel,
  ImagePlaceholder,
  Pressable,
  Screen,
  ScreenHeader,
  SegmentedPills,
  Text,
  TextField,
} from '@sc/ui';
import {
  useCreateProviderProduct,
  useDeleteProviderProduct,
  useProviderMarkOrderReady,
  useProviderOrders,
  useProviderProducts,
  useRestockProviderProduct,
  useUpdateProviderProduct,
} from '../../src/api/hooks/useMarket.js';
import { useStartOrderConversation } from '../../src/api/hooks/useChat.js';
import { describeError } from '../../src/api/errorMessage.js';
import { MarketBrowse } from '../../src/components/MarketBrowse.js';
import { cartItemCount, useCartStore } from '../../src/state/index.js';
import { PhotoPicker } from '../../src/components/PhotoPicker.js';
import { apiAssetUrl } from '../../src/api/client.js';

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
  inventoryImage: { width: 64, height: 64 },
  photoField: { marginTop: space.m },
  inventoryActions: { flexDirection: 'row', gap: space.s, marginTop: space.m },
  inventoryAction: { flex: 1 },
  editor: { marginTop: space.m, paddingTop: space.m, borderTopWidth: 1, borderTopColor: color.divider },
  lifecycle: {
    marginTop: space.m,
    padding: space.m,
    borderRadius: 12,
    backgroundColor: color.surface,
  },
  orderActions: { gap: space.s, marginTop: space.m },
});

type ShopMode = 'buy' | 'sell';
const ORDER_HISTORY_PREVIEW_COUNT = 2;

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
  const updateProduct = useUpdateProviderProduct();
  const restockProduct = useRestockProviderProduct();
  const deleteProduct = useDeleteProviderProduct();
  const markOrderReady = useProviderMarkOrderReady();
  const startConversation = useStartOrderConversation();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('1');
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editStock, setEditStock] = useState('');
  const [editImageUrls, setEditImageUrls] = useState<string[]>([]);
  const [restockingProductId, setRestockingProductId] = useState<string | null>(null);
  const [restockQuantity, setRestockQuantity] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showAllOrderHistory, setShowAllOrderHistory] = useState(false);
  const incomingOrders =
    orders?.filter(
      (order) => order.status === 'reserved' || order.status === 'ready_for_collection',
    ) ?? [];
  const orderHistory =
    orders?.filter((order) => order.status === 'collected' || order.status === 'cancelled') ?? [];
  const visibleOrderHistory = showAllOrderHistory
    ? orderHistory
    : orderHistory.slice(0, ORDER_HISTORY_PREVIEW_COUNT);

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
        imageUrls,
      },
      {
        onSuccess: () => {
          setName('');
          setDescription('');
          setPrice('');
          setStock('1');
          setImageUrls([]);
        },
        onError: (reason) => setError(describeError(reason, "Couldn't add that item.")),
      },
    );
  };

  const messageBuyer = (orderId: string) => {
    setError(null);
    startConversation.mutate(orderId, {
      onSuccess: (conversation) => {
        router.push({ pathname: '/chat/[threadId]', params: { threadId: conversation.id } });
      },
      onError: (reason) =>
        setError(describeError(reason, "Couldn't open your conversation. Try again.")),
    });
  };

  const openEditor = (product: NonNullable<typeof products>[number]) => {
    setEditingProductId(product.id);
    setRestockingProductId(null);
    setEditName(product.name);
    setEditDescription(product.description);
    setEditPrice((product.priceUsdCents / 100).toFixed(2));
    setEditStock(String(product.stockQty));
    setEditImageUrls(product.imageUrls);
  };

  const saveProduct = () => {
    if (!editingProductId) return;
    const valid =
      editName.trim().length >= 2 &&
      editDescription.trim().length >= 2 &&
      Number(editPrice) >= 1 &&
      Number(editStock) >= 0;
    if (!valid) {
      setError('Add a name, description, price, and stock amount before saving.');
      return;
    }
    setError(null);
    updateProduct.mutate(
      {
        id: editingProductId,
        input: {
          name: editName.trim(),
          description: editDescription.trim(),
          priceUsdCents: Math.round(Number(editPrice) * 100),
          stockQty: Math.floor(Number(editStock)),
          imageUrls: editImageUrls,
        },
      },
      {
        onSuccess: () => setEditingProductId(null),
        onError: (reason) => setError(describeError(reason, "Couldn't save that item.")),
      },
    );
  };

  const addStock = () => {
    if (!restockingProductId || Number(restockQuantity) < 1) return;
    setError(null);
    restockProduct.mutate(
      { id: restockingProductId, quantity: Math.floor(Number(restockQuantity)) },
      {
        onSuccess: () => {
          setRestockingProductId(null);
          setRestockQuantity('');
        },
        onError: (reason) => setError(describeError(reason, "Couldn't restock that item.")),
      },
    );
  };

  const removeProduct = (id: string, nameToRemove: string) => {
    Alert.alert(
      'Delete this item?',
      `${nameToRemove} will be removed from your shop. Earlier order records stay intact.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setError(null);
            deleteProduct.mutate(id, {
              onSuccess: () => setEditingProductId(null),
              onError: (reason) => setError(describeError(reason, "Couldn't delete that item.")),
            });
          },
        },
      ],
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
            {orders && incomingOrders.length === 0 ? (
              <EmptyPanel body="New marketplace orders will appear here." />
            ) : null}
            {incomingOrders.map((order) => (
              <Card bordered key={order.id} style={styles.card}>
                <View style={styles.row}>
                  <View style={styles.grow}>
                    <Text variant="cardTitle">{order.buyerName}</Text>
                    <Text variant="meta" color="neutral700" style={styles.meta}>
                      {order.reference} · {order.paymentMethod === 'ecocash' ? 'Paynow' : 'Cash'}
                    </Text>
                  </View>
                  <Badge label={ORDER_STATUS_LABELS[order.status]} tone="accent" />
                </View>
                {order.items.map((item) => (
                  <Text key={item.productId} variant="meta" color="neutral700">
                    {item.quantity} × {item.name}
                  </Text>
                ))}
                <Text variant="bodyStrong" style={styles.action}>
                  {formatUsd(order.totalUsdCents)}
                </Text>
                <View style={styles.lifecycle}>
                  <Text variant="meta" color="neutral700">
                    {order.status === 'reserved'
                      ? 'Pack this order, then tell the buyer when it is ready to collect.'
                      : 'The buyer has been told it is ready. They confirm once they have it.'}
                  </Text>
                </View>
                <View style={styles.orderActions}>
                  <Button
                    label={startConversation.isPending ? 'Opening…' : 'Message buyer'}
                    variant="secondary"
                    block
                    disabled={startConversation.isPending}
                    onPress={() => {
                      messageBuyer(order.id);
                    }}
                  />
                  {order.canMarkReady ? (
                    <Button
                      label={markOrderReady.isPending ? 'Updating…' : 'Ready for collection'}
                      block
                      disabled={markOrderReady.isPending}
                      onPress={() => {
                        setError(null);
                        markOrderReady.mutate(order.id, {
                          onSuccess: () => {
                            setError(null);
                          },
                          onError: (reason) =>
                            setError(describeError(reason, "Couldn't update that order.")),
                        });
                      }}
                    />
                  ) : null}
                </View>
              </Card>
            ))}
          </View>

          {orderHistory.length > 0 ? (
            <View style={styles.section}>
              <Text variant="sectionLabel" style={styles.title}>
                Order history
              </Text>
              {visibleOrderHistory.map((order) => (
                <Card bordered key={order.id} style={styles.card}>
                  <View style={styles.row}>
                    <View style={styles.grow}>
                      <Text variant="cardTitle">{order.buyerName}</Text>
                      <Text variant="meta" color="neutral700" style={styles.meta}>
                        {order.reference} · {order.paymentMethod === 'ecocash' ? 'Paynow' : 'Cash'}
                      </Text>
                    </View>
                    <Badge label={ORDER_STATUS_LABELS[order.status]} tone="neutral" />
                  </View>
                  {order.items.map((item) => (
                    <Text key={item.productId} variant="meta" color="neutral700">
                      {item.quantity} × {item.name}
                    </Text>
                  ))}
                  <Text variant="bodyStrong" style={styles.action}>
                    {formatUsd(order.totalUsdCents)}
                  </Text>
                  <Button
                    label={startConversation.isPending ? 'Opening…' : 'Message buyer'}
                    variant="secondary"
                    block
                    style={styles.action}
                    disabled={startConversation.isPending}
                    onPress={() => {
                      messageBuyer(order.id);
                    }}
                  />
                </Card>
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
                  onPress={() => {
                    setShowAllOrderHistory((current) => !current);
                  }}
                />
              ) : null}
            </View>
          ) : null}

          <View style={styles.section}>
            <Text variant="sectionLabel" style={styles.title}>
              Your inventory
            </Text>
            {productsError ? <EmptyPanel body="Couldn't load your marketplace items." /> : null}
            {products?.map((product) => (
              <Card bordered key={product.id} style={styles.card}>
                <View style={styles.row}>
                  <ImagePlaceholder
                    uri={apiAssetUrl(product.imageUrls[0])}
                    label={product.imageUrls.length ? undefined : 'No photo'}
                    radius={12}
                    style={styles.inventoryImage}
                  />
                  <View style={styles.grow}>
                    <Text variant="bodyStrong">{product.name}</Text>
                    <Text variant="meta" color="neutral700">
                      {product.stockQty} in stock
                    </Text>
                  </View>
                  <Text variant="bodyStrong">{formatUsd(product.priceUsdCents)}</Text>
                </View>
                <View style={styles.inventoryActions}>
                  <Button
                    label="Edit"
                    variant="secondary"
                    style={styles.inventoryAction}
                    disabled={updateProduct.isPending || deleteProduct.isPending}
                    onPress={() => {
                      if (editingProductId === product.id) {
                        setEditingProductId(null);
                        return;
                      }
                      openEditor(product);
                    }}
                  />
                  <Button
                    label="Restock"
                    style={styles.inventoryAction}
                    disabled={restockProduct.isPending || deleteProduct.isPending}
                    onPress={() => {
                      setRestockingProductId((current) =>
                        current === product.id ? null : product.id,
                      );
                      setEditingProductId(null);
                      setRestockQuantity('');
                    }}
                  />
                </View>
                {restockingProductId === product.id ? (
                  <View style={styles.editor}>
                    <TextField
                      label="Units received"
                      value={restockQuantity}
                      onChangeText={setRestockQuantity}
                      keyboardType="number-pad"
                      placeholder="e.g. 12"
                    />
                    <Button
                      label={restockProduct.isPending ? 'Restocking…' : 'Add to stock'}
                      block
                      style={styles.action}
                      disabled={Number(restockQuantity) < 1 || restockProduct.isPending}
                      onPress={addStock}
                    />
                  </View>
                ) : null}
                {editingProductId === product.id ? (
                  <View style={styles.editor}>
                    <View style={styles.field}>
                      <TextField label="Item name" value={editName} onChangeText={setEditName} />
                    </View>
                    <View style={styles.field}>
                      <TextField
                        label="Description"
                        value={editDescription}
                        onChangeText={setEditDescription}
                      />
                    </View>
                    <View style={styles.row}>
                      <View style={styles.grow}>
                        <TextField
                          label="Price (USD)"
                          value={editPrice}
                          onChangeText={setEditPrice}
                          keyboardType="decimal-pad"
                        />
                      </View>
                      <View style={styles.grow}>
                        <TextField
                          label="Stock"
                          value={editStock}
                          onChangeText={setEditStock}
                          keyboardType="number-pad"
                        />
                      </View>
                    </View>
                    <View style={styles.photoField}>
                      <PhotoPicker
                        label="Item photos"
                        urls={editImageUrls}
                        disabled={updateProduct.isPending}
                        onChange={setEditImageUrls}
                        onError={(message) => setError(message || null)}
                      />
                    </View>
                    <Button
                      label={updateProduct.isPending ? 'Saving…' : 'Save changes'}
                      block
                      style={styles.action}
                      disabled={updateProduct.isPending}
                      onPress={saveProduct}
                    />
                    <Button
                      label={deleteProduct.isPending ? 'Deleting…' : 'Delete item'}
                      variant="ghost"
                      block
                      style={styles.action}
                      disabled={deleteProduct.isPending}
                      onPress={() => removeProduct(product.id, product.name)}
                    />
                  </View>
                ) : null}
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
            <View style={styles.photoField}>
              <PhotoPicker
                label="Item photos"
                urls={imageUrls}
                disabled={createProduct.isPending}
                onChange={setImageUrls}
                onError={(message) => {
                  setError(message || null);
                }}
              />
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

import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Package, ShoppingBag } from 'lucide-react-native';
import {
  formatUsd,
  isOrderCompleted,
  ORDER_STATUS_LABELS,
  VENDOR_STATUS_LABELS,
  type ProductCategory,
  type ProviderOrderDto,
} from '@sc/shared';
import { space } from '@sc/tokens';
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
  useTheme,
} from '@sc/ui';
import {
  useCreateProviderProduct,
  useDeleteProviderProduct,
  useProviderProducts,
  useRestockProviderProduct,
  useUpdateProviderProduct,
  useVendorCancelOrder,
  useVendorCompleteOrder,
  useVendorMarkOrderReady,
  useVendorMe,
  useVendorOrders,
} from '../../src/api/hooks/useMarket.js';
import { useStartOrderConversation } from '../../src/api/hooks/useChat.js';
import { describeError } from '../../src/api/errorMessage.js';
import { MarketBrowse } from '../../src/components/MarketBrowse.js';
import { cartItemCount, useCartStore } from '../../src/state/index.js';
import { PhotoPicker } from '../../src/components/PhotoPicker.js';
import { apiAssetUrl } from '../../src/api/client.js';
import { RoleSwitcher } from '../../src/components/RoleSwitcher.js';
import { useBack } from '../../src/navigation/useBack.js';

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
    alignItems: 'center',
    justifyContent: 'center',
  },
  ordersButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartCount: { position: 'absolute', top: -4, right: -6 },
  inventoryImage: { width: 64, height: 64 },
  photoField: { marginTop: space.m },
  inventoryActions: { flexDirection: 'row', gap: space.s, marginTop: space.m },
  inventoryAction: { flex: 1 },
  editor: { marginTop: space.m, paddingTop: space.m, borderTopWidth: 1 },
  lifecycle: {
    marginTop: space.m,
    padding: space.m,
    borderRadius: 12,
  },
  orderActions: { gap: space.s, marginTop: space.m },
  categoryChips: { gap: space.s, paddingVertical: space.s },
  categoryChip: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: space.m,
    paddingVertical: space.s,
  },
});

const categoryOptions: { value: ProductCategory; label: string }[] = [
  { value: 'hair', label: 'Hair' },
  { value: 'wigs', label: 'Wigs' },
  { value: 'nails', label: 'Nails' },
  { value: 'skincare', label: 'Skincare' },
  { value: 'tools', label: 'Tools' },
  { value: 'other', label: 'Other' },
];

function CategoryPicker({
  value,
  onChange,
}: {
  value: ProductCategory;
  onChange: (value: ProductCategory) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.field}>
      <Text variant="meta" color="neutral700">
        Category
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoryChips}
      >
        {categoryOptions.map((option) => (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: value === option.value }}
            onPress={() => onChange(option.value)}
            style={[
              styles.categoryChip,
              {
                borderColor: value === option.value ? colors.accent : colors.divider,
                backgroundColor: value === option.value ? colors.accent : colors.surface,
              },
            ]}
          >
            <Text variant="meta" color={value === option.value ? colors.bg : colors.text}>
              {option.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

type ShopMode = 'buy' | 'sell';
const ORDER_HISTORY_PREVIEW_COUNT = 2;

/**
 * Only an approved vendor sells. Everyone else sees where their application
 * stands, and what to do next.
 */
function VendorStatusCard() {
  const { colors } = useTheme();
  const { data, isLoading, isError } = useVendorMe();
  const application = data?.application ?? null;

  if (isLoading) return <EmptyPanel body="Loading…" />;
  if (isError || !data) return <EmptyPanel body="Couldn't check your shop. Pull down to retry." />;

  if (!application) {
    return (
      <Card bordered style={styles.card}>
        <Text variant="cardTitle">Sell on StylistsCenter</Text>
        <Text variant="meta" color="neutral700" style={styles.meta}>
          Only verified beauty businesses with a physical shop can sell. Tell us about your shop and
          we will review it. Buyers pay you directly when they collect or receive their order.
        </Text>
        <Button
          label="Apply to sell"
          block
          style={styles.action}
          onPress={() => {
            router.push('/vendor/apply');
          }}
        />
      </Card>
    );
  }

  return (
    <Card bordered style={styles.card}>
      <View style={styles.row}>
        <View style={styles.grow}>
          <Text variant="cardTitle">{application.businessName}</Text>
          <Text variant="meta" color="neutral700" style={styles.meta}>
            {application.status === 'pending'
              ? 'We are checking your shop. You will get a notification when we are done.'
              : 'Your application was not approved.'}
          </Text>
        </View>
        <Badge
          label={VENDOR_STATUS_LABELS[application.status]}
          tone={application.status === 'pending' ? 'accent' : 'neutral'}
        />
      </View>
      {application.status === 'rejected' && application.reviewNote ? (
        <View style={[styles.lifecycle, { backgroundColor: colors.surface }]}>
          <Text variant="meta" color="neutral700">
            Reason: {application.reviewNote}
          </Text>
        </View>
      ) : null}
      <Button
        label={application.status === 'rejected' ? 'Fix and apply again' : 'Edit my application'}
        variant="secondary"
        block
        style={styles.action}
        onPress={() => {
          router.push('/vendor/apply');
        }}
      />
    </Card>
  );
}

/** One line per money part, so a vendor knows what to collect and why. */
function amountBreakdown(order: ProviderOrderDto): string {
  const parts = [`Products ${formatUsd(order.totalUsdCents)}`];
  if (order.deliveryChargeUsdCents > 0) {
    parts.push(`delivery ${formatUsd(order.deliveryChargeUsdCents)}`);
  }
  if (order.serviceFeeUsdCents > 0) {
    parts.push(`service fee ${formatUsd(order.serviceFeeUsdCents)}`);
  }
  if (order.coinsValueUsdCents > 0) parts.push(`coins -${formatUsd(order.coinsValueUsdCents)}`);
  return parts.join(' · ');
}

function orderLifecycleText(order: ProviderOrderDto): string {
  if (order.status === 'reserved') {
    return order.fulfilment === 'delivery'
      ? 'Pack this order, then tell the buyer it is on its way.'
      : 'Pack this order, then tell the buyer it is ready to collect.';
  }
  return order.fulfilment === 'delivery'
    ? 'The buyer has been told it is on its way. Mark it delivered once they have paid you.'
    : 'The buyer has been told it is ready. Mark it collected once they have paid you.';
}

/**
 * A stylist is also a marketplace buyer — they run out of the same braiding
 * hair or polish another seller has in stock. "Buy" reuses the exact same
 * catalogue the client Market tab shows (MarketBrowse); "Sell" is this
 * account's own storefront management.
 *
 * `standalone` is the same screen reached from the client Market tab, for
 * someone who has no stylist tabs (a shop that is not a stylist, or a
 * stylist browsing as a client): no tab bar, no role switcher, no Buy view.
 */
export function ShopScreen({ standalone = false }: { standalone?: boolean }) {
  const { colors } = useTheme();
  const onBack = useBack('/(tabs)/market');
  const [chosenMode, setMode] = useState<ShopMode>('sell');
  const mode = standalone ? 'sell' : chosenMode;
  const lines = useCartStore((s) => s.lines);
  const itemCount = cartItemCount(lines);

  const { data: vendorMe } = useVendorMe();
  const vendor = vendorMe?.application ?? null;
  const approved = vendor?.status === 'approved';

  const { data: products, isError: productsError } = useProviderProducts(approved);
  const { data: orders, isError: ordersError } = useVendorOrders(approved);
  const createProduct = useCreateProviderProduct();
  const updateProduct = useUpdateProviderProduct();
  const restockProduct = useRestockProviderProduct();
  const deleteProduct = useDeleteProviderProduct();
  const markOrderReady = useVendorMarkOrderReady();
  const completeOrder = useVendorCompleteOrder();
  const cancelOrder = useVendorCancelOrder();
  const startConversation = useStartOrderConversation();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ProductCategory>('other');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('1');
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCategory, setEditCategory] = useState<ProductCategory>('other');
  const [editPrice, setEditPrice] = useState('');
  const [editStock, setEditStock] = useState('');
  const [editVersion, setEditVersion] = useState(0);
  const [editImageUrls, setEditImageUrls] = useState<string[]>([]);
  const [restockingProductId, setRestockingProductId] = useState<string | null>(null);
  const [restockQuantity, setRestockQuantity] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showAllOrderHistory, setShowAllOrderHistory] = useState(false);
  const [pickupNotes, setPickupNotes] = useState<Record<string, string>>({});
  const isInProgress = (order: ProviderOrderDto) =>
    order.status !== 'cancelled' && !isOrderCompleted(order.status);
  const incomingOrders = orders?.filter(isInProgress) ?? [];
  const orderHistory = orders?.filter((order) => !isInProgress(order)) ?? [];
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
        category,
        priceUsdCents: Math.round(Number(price) * 100),
        stockQty: Math.floor(Number(stock)),
        imageUrls,
      },
      {
        onSuccess: () => {
          setName('');
          setDescription('');
          setCategory('other');
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

  const confirmComplete = (order: ProviderOrderDto) => {
    Alert.alert(
      order.fulfilment === 'delivery' ? 'Mark as delivered?' : 'Mark as collected?',
      `Only do this once ${order.buyerName} has the goods and has paid you ${formatUsd(order.amountDueUsdCents)}. This completes the order and adds the commission to your balance.`,
      [
        { text: 'Not yet', style: 'cancel' },
        {
          text: order.fulfilment === 'delivery' ? 'Delivered' : 'Collected',
          onPress: () => {
            setError(null);
            completeOrder.mutate(order.id, {
              onError: (reason) => setError(describeError(reason, "Couldn't update that order.")),
            });
          },
        },
      ],
    );
  };

  const confirmCancel = (order: ProviderOrderDto) => {
    Alert.alert('Cancel this order?', `${order.buyerName} will be told and the stock goes back.`, [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Cancel order',
        style: 'destructive',
        onPress: () => {
          setError(null);
          cancelOrder.mutate(order.id, {
            onError: (reason) => setError(describeError(reason, "Couldn't cancel that order.")),
          });
        },
      },
    ]);
  };

  const openEditor = (product: NonNullable<typeof products>[number]) => {
    setEditingProductId(product.id);
    setRestockingProductId(null);
    setEditName(product.name);
    setEditDescription(product.description);
    setEditCategory(product.category);
    setEditPrice((product.priceUsdCents / 100).toFixed(2));
    setEditStock(String(product.stockQty));
    setEditVersion(product.version);
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
          category: editCategory,
          priceUsdCents: Math.round(Number(editPrice) * 100),
          stockQty: Math.floor(Number(editStock)),
          expectedVersion: editVersion,
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

  const toggle = standalone ? null : (
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
  );

  return (
    <Screen
      hasTabBar={!standalone}
      // Buy mode is the infinite catalogue, so it gets a virtualised list
      // instead of Screen's ScrollView. Sell mode (inline editors, a form and
      // two short order lists) stays a plain scrolling column.
      renderList={
        mode === 'buy'
          ? (listProps) => <MarketBrowse listProps={listProps} leading={toggle} />
          : undefined
      }
      header={
        <ScreenHeader
          title="Shop"
          showBack={standalone}
          {...(standalone ? { onBack } : {})}
          right={
            <View style={styles.headerActions}>
              {mode === 'buy' ? (
                <>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="My orders"
                    onPress={() => {
                      router.push('/market/orders');
                    }}
                    style={[styles.ordersButton, { borderColor: colors.divider }]}
                  >
                    <Package size={18} strokeWidth={1.7} color={colors.text} />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      itemCount > 0 ? `Cart, ${String(itemCount)} items` : 'Cart, empty'
                    }
                    onPress={() => {
                      router.push('/market/cart');
                    }}
                    // `text`, not `neutral900`: the dark palette inherits
                    // neutral900 unchanged, so on dark it matched both the
                    // icon and the screen behind it and the button vanished.
                    style={[styles.cartButton, { borderColor: colors.divider }]}
                  >
                    <ShoppingBag size={18} strokeWidth={1.7} color={colors.text} />
                    {itemCount > 0 ? (
                      <View style={styles.cartCount}>
                        <Badge label={String(itemCount)} tone="accent" size="sm" />
                      </View>
                    ) : null}
                  </Pressable>
                </>
              ) : null}
              {standalone ? null : <RoleSwitcher />}
            </View>
          }
        />
      }
    >
      {toggle}

      {mode === 'sell' ? <>{approved ? null : <VendorStatusCard />}</> : null}

      {mode === 'sell' && approved ? (
        <>
          <Card bordered style={styles.card}>
            <Text variant="cardTitle">Delivery and collection</Text>
            <Text variant="meta" color="neutral700" style={styles.meta}>
              {vendor?.delivers
                ? `You deliver (${formatUsd(vendor.deliveryChargeUsdCents)}) to ${vendor.deliveryAreas.join(', ')}.`
                : 'You do not deliver. Buyers collect from your shop.'}
            </Text>
            <Button
              label="Change delivery and collection"
              variant="secondary"
              block
              style={styles.action}
              onPress={() => {
                router.push('/vendor/settings');
              }}
            />
          </Card>

          {error ? (
            <Text variant="meta" color={colors.accent700} style={styles.error}>
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
                      {order.reference} ·{' '}
                      {order.fulfilment === 'delivery' ? 'Delivery' : 'Collection'}
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
                  {order.paymentMethod === 'ecocash'
                    ? 'Paid in the app'
                    : `Collect ${formatUsd(order.amountDueUsdCents)} from the buyer`}
                </Text>
                <Text variant="metaSmall" color="neutral600">
                  {amountBreakdown(order)}
                </Text>
                {order.fulfilment === 'delivery' ? (
                  <Text variant="meta" color="neutral700" style={styles.meta}>
                    Deliver to: {order.deliveryAddress}
                    {order.buyerPhone ? ` · ${order.buyerPhone}` : ''}
                  </Text>
                ) : null}
                <View style={[styles.lifecycle, { backgroundColor: colors.surface }]}>
                  <Text variant="meta" color="neutral700">
                    {orderLifecycleText(order)}
                  </Text>
                </View>
                <View style={styles.orderActions}>
                  {order.canMarkReady ? (
                    <TextField
                      label={
                        order.fulfilment === 'delivery'
                          ? 'Delivery time or note'
                          : 'Collection time or instructions'
                      }
                      placeholder="For example, ready today after 4 pm"
                      value={pickupNotes[order.id] ?? ''}
                      onChangeText={(value) => {
                        setPickupNotes((current) => ({ ...current, [order.id]: value }));
                      }}
                    />
                  ) : order.pickupNote ? (
                    <Text variant="meta" color="neutral700">
                      {order.pickupNote}
                    </Text>
                  ) : null}
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
                      label={
                        markOrderReady.isPending
                          ? 'Updating…'
                          : order.fulfilment === 'delivery'
                            ? 'Out for delivery'
                            : 'Ready for collection'
                      }
                      block
                      disabled={markOrderReady.isPending}
                      onPress={() => {
                        setError(null);
                        markOrderReady.mutate(
                          {
                            orderId: order.id,
                            input: { pickupNote: pickupNotes[order.id]?.trim() || undefined },
                          },
                          {
                            onError: (reason) =>
                              setError(describeError(reason, "Couldn't update that order.")),
                          },
                        );
                      }}
                    />
                  ) : null}
                  {order.canComplete ? (
                    <Button
                      label={
                        completeOrder.isPending
                          ? 'Updating…'
                          : order.fulfilment === 'delivery'
                            ? 'Mark delivered'
                            : 'Mark collected'
                      }
                      variant={order.canMarkReady ? 'secondary' : 'primary'}
                      block
                      disabled={completeOrder.isPending}
                      onPress={() => {
                        confirmComplete(order);
                      }}
                    />
                  ) : null}
                  {order.canCancel ? (
                    <Button
                      label="Cancel order"
                      variant="ghost"
                      block
                      disabled={cancelOrder.isPending}
                      onPress={() => {
                        confirmCancel(order);
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
                        {order.reference} ·{' '}
                        {order.fulfilment === 'delivery' ? 'Delivery' : 'Collection'}
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
                    {formatUsd(order.totalUsdCents)} products
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
                  <View style={[styles.editor, { borderTopColor: colors.divider }]}>
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
                  <View style={[styles.editor, { borderTopColor: colors.divider }]}>
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
                    <CategoryPicker value={editCategory} onChange={setEditCategory} />
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
            <CategoryPicker value={category} onChange={setCategory} />
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
      ) : null}
    </Screen>
  );
}

export default function ProviderShop() {
  return <ShopScreen />;
}

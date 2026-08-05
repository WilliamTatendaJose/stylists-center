import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { BadgeCheck } from 'lucide-react-native';
import { formatUsd, MAX_ORDER_ITEM_QUANTITY } from '@sc/shared';
import { color, space } from '@sc/tokens';
import {
  Screen,
  ScreenHeader,
  Text,
  Avatar,
  Button,
  Badge,
  EmptyPanel,
  ImagePlaceholder,
} from '@sc/ui';
import { useProduct } from '../../src/api/hooks/useMarket.js';
import { useCartStore } from '../../src/state/index.js';
import { useBack } from '../../src/navigation/useBack.js';

const styles = StyleSheet.create({
  image: { height: 220, marginBottom: space.l },
  title: { marginBottom: space.xs },
  price: { marginBottom: space.m },
  sellerRow: { flexDirection: 'row', alignItems: 'center', gap: space.m, marginBottom: space.l },
  sellerText: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  description: { marginBottom: space.l },
  stockRow: { marginBottom: space.xl },
  footer: { gap: space.s },
});

/** Product detail (handoff screen 16). */
export default function ProductDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const onBack = useBack('/(tabs)/market');
  const { data: product, isError } = useProduct(id);

  const addToCart = useCartStore((s) => s.add);
  const [added, setAdded] = useState(false);

  if (!product) {
    return (
      <Screen header={<ScreenHeader title="Item" onBack={onBack} />}>
        <EmptyPanel
          title={isError ? "Couldn't load this item" : undefined}
          body={isError ? 'Check your connection and try again.' : 'Loading…'}
        />
      </Screen>
    );
  }

  const soldOut = product.stockQty <= 0;

  const add = () => {
    addToCart(
      { providerId: product.providerId, providerName: product.providerName },
      {
        productId: product.id,
        name: product.name,
        priceUsdCents: product.priceUsdCents,
        stockQty: product.stockQty,
      },
    );
    setAdded(true);
  };

  return (
    <Screen
      header={<ScreenHeader title="Item" onBack={onBack} />}
      footer={
        <View style={styles.footer}>
          {added ? (
            <Button
              label="Go to cart"
              block
              size="lg"
              arrow
              onPress={() => {
                router.push('/market/cart');
              }}
            />
          ) : (
            <Button
              label={soldOut ? 'Sold out' : 'Add to cart'}
              block
              size="lg"
              disabled={soldOut}
              onPress={add}
            />
          )}
        </View>
      }
    >
      {/* No product photography exists yet (plan R10) — the placeholder is
          honest about that rather than shipping a fake stock image. */}
      <ImagePlaceholder label={product.name} style={styles.image} />

      <Text variant="h3" style={styles.title}>
        {product.name}
      </Text>
      <Text variant="h3" color={color.accent} style={styles.price}>
        {formatUsd(product.priceUsdCents)}
      </Text>

      <View style={styles.sellerRow}>
        <Avatar initials={product.initials} tint={product.tint} size={44} />
        <View style={styles.sellerText}>
          <View style={styles.nameRow}>
            <Text variant="cardTitle">{product.providerName}</Text>
            {product.verified ? <BadgeCheck size={15} color={color.accent} /> : null}
          </View>
          <Text variant="meta" color="neutral700">
            {product.areaName} · {product.distanceKm.toFixed(1)} km away
          </Text>
        </View>
      </View>

      <Text variant="body" color="neutral700" style={styles.description}>
        {product.description}
      </Text>

      <View style={styles.stockRow}>
        <Badge
          label={
            soldOut
              ? 'Sold out'
              : product.stockQty <= 3
                ? `Only ${String(product.stockQty)} left`
                : `${String(product.stockQty)} available`
          }
          tone={soldOut || product.stockQty <= 3 ? 'accent' : 'neutral'}
        />
      </View>

      <Text variant="metaSmall" color="neutral600">
        You collect this from {product.providerName} in {product.areaName}. Stock is held for you
        once you order — up to {String(MAX_ORDER_ITEM_QUANTITY)} of any one item.
      </Text>
    </Screen>
  );
}

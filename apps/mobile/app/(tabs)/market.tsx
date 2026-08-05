import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ShoppingBag } from 'lucide-react-native';
import { formatUsd, type ProductRowDto } from '@sc/shared';
import { color, space } from '@sc/tokens';
import {
  Screen,
  ScreenHeader,
  Text,
  Pressable,
  SearchField,
  SectionLabel,
  ListRow,
  EmptyPanel,
  Badge,
} from '@sc/ui';
import { DistanceFilter } from '../../src/components/DistanceFilter.js';
import { useMyOrders, useProducts } from '../../src/api/hooks/useMarket.js';
import { useDebouncedValue } from '../../src/hooks/useDebouncedValue.js';
import { cartItemCount, useCartStore, useSessionStore } from '../../src/state/index.js';

const MIN_SEARCH_QUERY = 2;

const styles = StyleSheet.create({
  searchRow: { flexDirection: 'row', gap: space.s, alignItems: 'center', marginBottom: space.m },
  cartButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: color.neutral900,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartCount: { position: 'absolute', top: -4, right: -6 },
  loadMore: { paddingVertical: space.m, alignItems: 'center' },
  errorNote: { marginBottom: space.m, gap: space.xs },
});

/**
 * Marketplace (handoff screens 15-18). Stylists sell the hair, wigs and
 * supplies they already work with; buyers collect in person, which is why
 * every row leads with the seller and the distance to them.
 */
export default function Market() {
  const maxDistanceKm = useSessionStore((s) => s.maxDistanceKm);
  const lines = useCartStore((s) => s.lines);
  const itemCount = cartItemCount(lines);

  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query);
  const products = useProducts(debouncedQuery);
  const items = useMemo(() => products.data?.pages.flatMap((page) => page.items), [products.data]);

  const { data: orders } = useMyOrders();
  const openOrders = orders?.filter((o) => o.status === 'reserved').length ?? 0;

  const isSearching = query.trim().length > 0;
  const tooShort = isSearching && debouncedQuery.trim().length < MIN_SEARCH_QUERY;

  const openProduct = (product: ProductRowDto) => {
    router.push({ pathname: '/market/[id]', params: { id: product.id } });
  };

  return (
    <Screen
      hasTabBar
      header={
        <ScreenHeader
          title="Market"
          showBack={false}
          right={
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
          }
        />
      }
    >
      <View style={styles.searchRow}>
        <SearchField placeholder="Hair, wigs, polish…" value={query} onChangeText={setQuery} />
      </View>

      {/* Same distance control as Find, reading the same stored preference —
          "within N km" means one thing across the whole app. */}
      <DistanceFilter />

      {openOrders > 0 ? (
        <ListRow
          avatar={{ initials: String(openOrders), tint: color.accent, size: 44 }}
          title={
            openOrders === 1 ? '1 order to collect' : `${String(openOrders)} orders to collect`
          }
          meta="Tap to see where to pick it up"
          onPress={() => {
            router.push('/market/orders');
          }}
        />
      ) : null}

      {products.isError && !items?.length ? (
        <View style={styles.errorNote}>
          <Text variant="meta" color={color.accent700} accessibilityRole="alert">
            Couldn&apos;t load the market.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Try loading the market again"
            onPress={() => {
              void products.refetch();
            }}
          >
            <Text variant="meta" color={color.accent}>
              Try again
            </Text>
          </Pressable>
        </View>
      ) : products.isError ? (
        <Text variant="meta" color="neutral700" style={styles.errorNote}>
          Showing the last update — couldn&apos;t reach the server just now.
        </Text>
      ) : null}

      <SectionLabel
        label={isSearching ? `Results for “${query.trim()}”` : 'For sale near you'}
        count={items?.length}
      />

      {tooShort ? (
        <EmptyPanel body="Keep typing — two letters or more." />
      ) : items?.length ? (
        <>
          {items.map((product) => (
            <ListRow
              key={product.id}
              avatar={{ initials: product.initials, tint: product.tint, size: 54 }}
              title={product.name}
              meta={`${product.providerName} · ${product.areaName}`}
              // Stock is called out only when it is low enough to matter:
              // "12 available" is noise, "Only 2 left" is a reason to decide.
              subMeta={
                product.stockQty <= 3
                  ? `Only ${String(product.stockQty)} left`
                  : `${String(product.stockQty)} available`
              }
              rightPrimary={formatUsd(product.priceUsdCents)}
              rightCaption={`${product.distanceKm.toFixed(1)} km`}
              onPress={() => {
                openProduct(product);
              }}
            />
          ))}
          {products.hasNextPage ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Load more items"
              disabled={products.isFetchingNextPage}
              onPress={() => {
                void products.fetchNextPage();
              }}
              style={styles.loadMore}
            >
              <Text variant="meta" color={color.accent}>
                {products.isFetchingNextPage ? 'Loading…' : 'Show more'}
              </Text>
            </Pressable>
          ) : null}
        </>
      ) : (
        <EmptyPanel
          body={
            products.isLoading
              ? 'Loading the market…'
              : isSearching
                ? `Nothing matching “${debouncedQuery.trim()}” within ${String(maxDistanceKm)} km.`
                : `Nothing for sale within ${String(maxDistanceKm)} km yet. Try a wider distance.`
          }
        />
      )}
    </Screen>
  );
}

import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { formatUsd, type ProductRowDto } from '@sc/shared';
import { space } from '@sc/tokens';
import { Text, Pressable, SearchField, SectionLabel, ListRow, EmptyPanel, useTheme } from '@sc/ui';
import { DistanceFilter } from './DistanceFilter.js';
import { useMyOrders, useProducts } from '../api/hooks/useMarket.js';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import { useSessionStore } from '../state/index.js';
import { apiAssetUrl } from '../api/client.js';
import { ServerConnectionPanel } from './ServerConnectionPanel.js';

const MIN_SEARCH_QUERY = 2;

const styles = StyleSheet.create({
  searchRow: { flexDirection: 'row', gap: space.s, alignItems: 'center', marginBottom: space.m },
  loadMore: { paddingVertical: space.m, alignItems: 'center' },
});

/**
 * The marketplace catalogue — search, distance filter, "orders to collect"
 * shortcut, and the results list. Extracted from the client Market tab so
 * the provider Shop screen's "Buy" view can render the exact same browsing
 * experience instead of a second, drifting copy of it.
 */
export function MarketBrowse() {
  const { colors } = useTheme();
  const maxDistanceKm = useSessionStore((s) => s.maxDistanceKm);

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
    <>
      <View style={styles.searchRow}>
        <SearchField placeholder="Hair, wigs, polish…" value={query} onChangeText={setQuery} />
      </View>

      {/* Same distance control as Find, reading the same stored preference —
          "within N km" means one thing across the whole app. */}
      <DistanceFilter />

      {openOrders > 0 ? (
        <ListRow
          avatar={{ initials: String(openOrders), tint: colors.accent, size: 44 }}
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
        <ServerConnectionPanel error={products.error} onRetry={() => void products.refetch()} />
      ) : products.isError ? (
        <ServerConnectionPanel
          error={products.error}
          compact
          onRetry={() => void products.refetch()}
        />
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
              avatar={{
                initials: product.initials,
                tint: product.tint,
                uri: apiAssetUrl(product.imageUrls[0]),
                size: 54,
              }}
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
              <Text variant="meta" color={colors.accent}>
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
    </>
  );
}

import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { formatUsd, type ProductCategory, type ProductRowDto, type ProductSort } from '@sc/shared';
import { space } from '@sc/tokens';
import {
  Text,
  Pressable,
  SearchField,
  SectionLabel,
  ListRow,
  EmptyPanel,
  TextField,
  Button,
  useTheme,
} from '@sc/ui';
import { DistanceFilter } from './DistanceFilter.js';
import { useMyOrders, useProducts, type MarketFilters } from '../api/hooks/useMarket.js';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import { useSessionStore } from '../state/index.js';
import { apiAssetUrl } from '../api/client.js';
import { ServerConnectionPanel } from './ServerConnectionPanel.js';

const MIN_SEARCH_QUERY = 2;

const styles = StyleSheet.create({
  searchRow: { flexDirection: 'row', gap: space.s, alignItems: 'center', marginBottom: space.m },
  loadMore: { paddingVertical: space.m, alignItems: 'center' },
  filters: { marginBottom: space.m, gap: space.s },
  chips: { gap: space.s, paddingVertical: space.s },
  chip: { borderWidth: 1, borderRadius: 18, paddingHorizontal: space.m, paddingVertical: space.s },
  prices: { flexDirection: 'row', gap: space.s },
  priceField: { flex: 1 },
});

const categories: { value: ProductCategory | undefined; label: string }[] = [
  { value: undefined, label: 'All' },
  { value: 'hair', label: 'Hair' },
  { value: 'wigs', label: 'Wigs' },
  { value: 'nails', label: 'Nails' },
  { value: 'skincare', label: 'Skincare' },
  { value: 'tools', label: 'Tools' },
  { value: 'other', label: 'Other' },
];
const sorts: { value: ProductSort; label: string }[] = [
  { value: 'nearest', label: 'Nearest' },
  { value: 'price_asc', label: 'Lowest price' },
  { value: 'price_desc', label: 'Highest price' },
  { value: 'newest', label: 'Newest' },
];

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
  const [showFilters, setShowFilters] = useState(false);
  const [category, setCategory] = useState<ProductCategory | undefined>();
  const [sort, setSort] = useState<ProductSort>('nearest');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [priceError, setPriceError] = useState<string | null>(null);
  const [prices, setPrices] = useState<
    Pick<MarketFilters, 'minPriceUsdCents' | 'maxPriceUsdCents'>
  >({});
  const products = useProducts(debouncedQuery, { category, sort, ...prices });
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

      <View style={styles.filters}>
        <Button
          label={showFilters ? 'Hide filters' : 'Categories, price and sort'}
          variant="secondary"
          onPress={() => setShowFilters((current) => !current)}
        />
        {showFilters ? (
          <>
            <Text variant="sectionLabel">Category</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
            >
              {categories.map((option) => (
                <Pressable
                  key={option.label}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: category === option.value }}
                  onPress={() => setCategory(option.value)}
                  style={[
                    styles.chip,
                    {
                      borderColor: category === option.value ? colors.accent : colors.divider,
                      backgroundColor: category === option.value ? colors.accent : colors.surface,
                    },
                  ]}
                >
                  <Text variant="meta" color={category === option.value ? colors.bg : colors.text}>
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <Text variant="sectionLabel">Price in USD</Text>
            <View style={styles.prices}>
              <View style={styles.priceField}>
                <TextField
                  label="Minimum"
                  value={minPrice}
                  onChangeText={setMinPrice}
                  keyboardType="decimal-pad"
                  placeholder="Any"
                />
              </View>
              <View style={styles.priceField}>
                <TextField
                  label="Maximum"
                  value={maxPrice}
                  onChangeText={setMaxPrice}
                  keyboardType="decimal-pad"
                  placeholder="Any"
                />
              </View>
            </View>
            <Button
              label="Apply price"
              variant="secondary"
              onPress={() => {
                const min = Number(minPrice);
                const max = Number(maxPrice);
                if (
                  (minPrice && (!Number.isFinite(min) || min < 0)) ||
                  (maxPrice && (!Number.isFinite(max) || max < 0)) ||
                  (minPrice && maxPrice && min > max)
                ) {
                  setPriceError('Enter valid prices; the minimum cannot exceed the maximum.');
                  return;
                }
                setPriceError(null);
                setPrices({
                  ...(minPrice ? { minPriceUsdCents: Math.round(min * 100) } : {}),
                  ...(maxPrice ? { maxPriceUsdCents: Math.round(max * 100) } : {}),
                });
              }}
            />
            {priceError ? (
              <Text variant="meta" color={colors.accent700}>
                {priceError}
              </Text>
            ) : null}
            <Button
              label="Clear filters"
              variant="ghost"
              onPress={() => {
                setCategory(undefined);
                setSort('nearest');
                setMinPrice('');
                setMaxPrice('');
                setPrices({});
                setPriceError(null);
              }}
            />
            <Text variant="sectionLabel">Sort by</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
            >
              {sorts.map((option) => (
                <Pressable
                  key={option.value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: sort === option.value }}
                  onPress={() => setSort(option.value)}
                  style={[
                    styles.chip,
                    {
                      borderColor: sort === option.value ? colors.accent : colors.divider,
                      backgroundColor: sort === option.value ? colors.accent : colors.surface,
                    },
                  ]}
                >
                  <Text variant="meta" color={sort === option.value ? colors.bg : colors.text}>
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </>
        ) : null}
      </View>

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

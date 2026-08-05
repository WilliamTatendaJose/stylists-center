import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { MapPin, Compass, BadgeCheck, User } from 'lucide-react-native';
import type { ProviderListRowDto } from '@sc/shared';
import { color, layout, space } from '@sc/tokens';
import {
  Screen,
  Text,
  Pressable,
  Pill,
  SearchField,
  CategoryTile,
  ListRow,
  SectionLabel,
  LiveDot,
  Card,
  Button,
  Sheet,
  EmptyPanel,
} from '@sc/ui';
import { DistanceFilter } from '../../src/components/DistanceFilter.js';
import { useCategories } from '../../src/api/hooks/useCategories.js';
import { useNearbyProviders, useSearchProviders } from '../../src/api/hooks/useProviders.js';
import { useRecentStylists } from '../../src/api/hooks/useRecentStylists.js';
import { useDebouncedValue } from '../../src/hooks/useDebouncedValue.js';
import { useMe, useSetActiveRole } from '../../src/api/hooks/useMe.js';
import { describeError } from '../../src/api/errorMessage.js';
import { useRequestStore, useSessionStore } from '../../src/state/index.js';
import { useDeviceLocation } from '../../src/location/useDeviceLocation.js';

const styles = StyleSheet.create({
  header: { gap: 8 },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  wordmark: { marginRight: 'auto' },
  profileButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: color.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  hero: { marginBottom: space.l },
  searchRow: {
    flexDirection: 'row',
    gap: space.s,
    alignItems: 'center',
    marginBottom: layout.section,
  },
  mapButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: color.neutral900,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: layout.section,
  },
  categoryTile: { flexBasis: '48%' },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  spacer: { height: space.xxl },
  promoCard: { padding: space.l },
  promoKicker: { marginBottom: space.xs },
  promoTitle: { marginBottom: space.xs },
  promoBody: { marginBottom: space.m },
  sheetTitle: { marginBottom: space.s },
  sheetBody: { marginBottom: space.xl },
  sheetActions: { gap: space.s },
  errorNote: { marginBottom: space.m, gap: space.xs },
  loadMore: { paddingVertical: space.m, alignItems: 'center' },
});

/** Mirrors the API's own `q` minimum, so the client never sends a query it knows will 400. */
const MIN_SEARCH_QUERY = 2;

/**
 * One row shape for both the browse list and search results, so a stylist
 * looks the same however you found them.
 *
 * `verified` was already on every row from the API and simply never rendered
 * — in a marketplace where you travel to a stranger's home it is the single
 * strongest trust signal available, and `ListRow` was built with a
 * `titleBadge` slot for exactly this.
 */
function ProviderRow({ provider }: { provider: ProviderListRowDto }) {
  return (
    <ListRow
      avatar={{ initials: provider.initials, tint: provider.tint, size: 54 }}
      title={provider.displayName}
      titleBadge={provider.verified ? <BadgeCheck size={15} color={color.accent} /> : undefined}
      meta={`${provider.categoryName} · ${provider.areaName}`}
      subMeta={
        provider.acceptingBookings
          ? `${provider.ratingAvg.toFixed(1)} ★ · ${String(provider.completedCount)} done`
          : // Search deliberately returns stylists who are off, so the row has
            // to say so rather than letting the user find out by being ignored.
            `Not taking bookings · ${provider.ratingAvg.toFixed(1)} ★`
      }
      rightPrimary={`from $${(provider.fromPriceUsdCents / 100).toFixed(0)}`}
      rightCaption={`${provider.distanceKm.toFixed(1)} km`}
      onPress={() => {
        router.push({ pathname: '/provider/[id]', params: { id: provider.id, back: '/(tabs)' } });
      }}
    />
  );
}

/** Explicit "load more" rather than scroll-triggered: on a metered connection the next page should be the user's decision. */
function LoadMore({
  hasNextPage,
  isFetching,
  onPress,
}: {
  hasNextPage: boolean;
  isFetching: boolean;
  onPress: () => void;
}) {
  if (!hasNextPage) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Load more stylists"
      disabled={isFetching}
      onPress={onPress}
      style={styles.loadMore}
    >
      <Text variant="meta" color={color.accent}>
        {isFetching ? 'Loading…' : 'Show more'}
      </Text>
    </Pressable>
  );
}

export default function Find() {
  const maxDistanceKm = useSessionStore((s) => s.maxDistanceKm);

  const {
    data: categories,
    isError: categoriesError,
    refetch: refetchCategories,
  } = useCategories(maxDistanceKm);

  const nearby = useNearbyProviders();
  const providersError = nearby.isError;
  const refetchProviders = nearby.refetch;
  // Infinite queries hand back pages; screens want one list.
  const providers = useMemo(() => nearby.data?.pages.flatMap((page) => page.items), [nearby.data]);

  const { recent: recentStylists } = useRecentStylists();

  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query);
  const searchTerm = debouncedQuery.trim();
  const isSearching = query.trim().length > 0;
  const search = useSearchProviders(debouncedQuery);
  const searchFetching = search.isFetching;
  const searchError = search.isError;
  const searchResults = useMemo(
    () => search.data?.pages.flatMap((page) => page.items),
    [search.data],
  );
  const { data: me } = useMe();
  const setActiveRole = useSetActiveRole();
  // Fall back to the persisted local role only until /v1/me resolves, so the
  // pill never renders empty on a cold start.
  const storedRole = useSessionStore((s) => s.activeRole);
  const activeRole = me?.activeRole ?? storedRole;
  const hasProviderProfile = me?.hasProviderProfile ?? false;
  const locationSource = useSessionStore((s) => s.locationSource);
  const areaLabel = useSessionStore((s) => s.areaLabel);
  const setCategory = useRequestStore((s) => s.setCategory);
  const [roleSheetOpen, setRoleSheetOpen] = useState(false);
  const [roleError, setRoleError] = useState<string | null>(null);
  const isProvider = activeRole === 'provider';

  const anyError = categoriesError || providersError;
  const hasNothingToShow = anyError && !categories?.length && !providers?.length;
  const isStale = anyError && !hasNothingToShow;

  const switchRole = async () => {
    setRoleError(null);
    try {
      await setActiveRole.mutateAsync(isProvider ? 'client' : 'provider');
      setRoleSheetOpen(false);
    } catch (err) {
      setRoleError(describeError(err, "Couldn't switch roles. Try again."));
    }
  };

  // Asked here rather than at launch: this is the first screen whose content
  // actually depends on the answer, so the prompt arrives with visible context.
  const { retry: retryLocation } = useDeviceLocation();

  const goMap = () => {
    router.push('/map/search');
  };

  const openCategory = (categoryId: string) => {
    setCategory(categoryId);
    router.push('/request/new');
  };

  const openRequest = () => {
    router.push('/request/new');
  };

  const header = (
    <View style={styles.header}>
      <View style={styles.headerTop}>
        <Text variant="wordmark" style={styles.wordmark}>
          STYLISTS CENTER
        </Text>
        <Pill
          label={activeRole}
          showChevron
          onPress={() => {
            setRoleSheetOpen(true);
          }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Profile"
          onPress={() => {
            router.push('/profile');
          }}
          style={styles.profileButton}
        >
          <User size={16} strokeWidth={1.8} color={color.text} />
        </Pressable>
      </View>
      {/* The label states what is actually true of the coordinates driving
          every count and distance below. Only a real device fix earns
          "located"; a fallback says so, and offers the way out. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          locationSource === 'device' ? 'Your location' : 'Turn on location for accurate distances'
        }
        disabled={locationSource === 'device' || locationSource === 'pending'}
        onPress={() => {
          void retryLocation();
        }}
        style={styles.locationRow}
      >
        <MapPin size={12} strokeWidth={1.8} color={color.accent} />
        <Text variant="meta" color="neutral700">
          {locationSource === 'device'
            ? `${areaLabel ?? 'Your area'} · located`
            : locationSource === 'pending'
              ? 'Finding you…'
              : 'Showing Harare centre · turn on location'}
        </Text>
      </Pressable>
    </View>
  );

  return (
    <>
      <Screen hasTabBar header={header}>
        <Text variant="h2" style={styles.hero}>
          Book the hands{'\n'}you actually want.
        </Text>

        {/* A failed background refresh over data we already have is not the
            same event as having nothing to show. The list polls every minute,
            so treating any error as fatal would put a red banner over a
            perfectly good screen on one dropped request. */}
        {hasNothingToShow ? (
          <View style={styles.errorNote}>
            <Text variant="meta" color={color.accent700} accessibilityRole="alert">
              Couldn&apos;t load stylists near you.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Try loading stylists again"
              onPress={() => {
                void refetchProviders();
                void refetchCategories();
              }}
            >
              <Text variant="meta" color={color.accent}>
                Try again
              </Text>
            </Pressable>
          </View>
        ) : isStale ? (
          <Text variant="meta" color="neutral700" style={styles.errorNote}>
            Showing the last update — couldn&apos;t reach the server just now.
          </Text>
        ) : null}

        <View style={styles.searchRow}>
          <SearchField
            placeholder="Looking for a good braider…"
            value={query}
            onChangeText={setQuery}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Search on the map"
            onPress={goMap}
            style={styles.mapButton}
          >
            <Compass size={18} strokeWidth={1.7} color={color.bg} />
          </Pressable>
        </View>

        {/* One distance for the whole app — the counts, the list, search and
            the map all answer for the same area, so no screen can contradict
            another. A free 1-50 km slider, not the fixed 1/3/8 rungs the
            smart-match retry ladder uses — browsing has no reason to share
            that constraint. */}
        <DistanceFilter />

        {/* Searching replaces the browse view rather than appending to it —
            two competing lists of stylists on one screen leaves the user
            unsure which one answered their question. */}
        {isSearching ? (
          <>
            <SectionLabel label={`Results for “${query.trim()}”`} count={searchResults?.length} />
            {searchTerm.length < MIN_SEARCH_QUERY ? (
              <EmptyPanel body="Keep typing — two letters or more." />
            ) : searchError ? (
              <EmptyPanel
                title="Couldn't run that search"
                body="Check your connection and try again."
              />
            ) : searchFetching && !searchResults ? (
              <EmptyPanel body="Searching…" />
            ) : searchResults?.length ? (
              <>
                {searchResults.map((p) => (
                  <ProviderRow key={p.id} provider={p} />
                ))}
                <LoadMore
                  hasNextPage={!!search.hasNextPage}
                  isFetching={search.isFetchingNextPage}
                  onPress={() => {
                    void search.fetchNextPage();
                  }}
                />
              </>
            ) : (
              <EmptyPanel
                title="No stylists matched"
                body={`Nothing for “${searchTerm}” within ${String(maxDistanceKm)} km. Try a wider distance or a different word.`}
              />
            )}
          </>
        ) : (
          <>
            {/* The returning-user shortcut. Only shown when there is real
                history, so a new account never sees an empty shelf. */}
            {recentStylists.length > 0 ? (
              <>
                <SectionLabel label="Book again" />
                {recentStylists.map((stylist) => (
                  <ListRow
                    key={stylist.providerId}
                    avatar={{ initials: stylist.initials, tint: stylist.tint, size: 44 }}
                    title={stylist.displayName}
                    meta={`Last time · ${stylist.lastServiceName}`}
                    onPress={() => {
                      router.push({
                        pathname: '/provider/[id]',
                        params: { id: stylist.providerId, back: '/(tabs)' },
                      });
                    }}
                  />
                ))}
                <View style={styles.spacer} />
              </>
            ) : null}

            <SectionLabel label="Categories" count={categories?.length} />
            <View style={styles.categoryGrid}>
              {categories?.map((c) => (
                <View key={c.id} style={styles.categoryTile}>
                  <CategoryTile
                    name={c.name}
                    nearbyCount={c.nearbyCount}
                    onPress={() => {
                      openCategory(c.id);
                    }}
                  />
                </View>
              ))}
            </View>

            <SectionLabel
              label="Available now"
              right={
                <View style={styles.liveRow}>
                  <LiveDot />
                  <Text variant="meta" color={color.accent700}>
                    live
                  </Text>
                </View>
              }
            />
            {providers?.length ? (
              <>
                {providers.map((p) => (
                  <ProviderRow key={p.id} provider={p} />
                ))}
                <LoadMore
                  hasNextPage={!!nearby.hasNextPage}
                  isFetching={nearby.isFetchingNextPage}
                  onPress={() => {
                    void nearby.fetchNextPage();
                  }}
                />
              </>
            ) : (
              // Distinguishes "nobody within this distance" from "still
              // loading" — with a real position the empty case is common and
              // the fix (widen the distance) is one tap away.
              <EmptyPanel
                body={
                  providers
                    ? `No stylists within ${String(maxDistanceKm)} km right now. Try a wider distance.`
                    : 'Looking for stylists near you…'
                }
              />
            )}
          </>
        )}

        <View style={styles.spacer} />
        <Card bordered style={styles.promoCard}>
          <Text variant="sectionLabel" color={color.accent} style={styles.promoKicker}>
            Smart match
          </Text>
          <Text variant="cardTitle" style={styles.promoTitle}>
            Don&apos;t browse. Let them come to you.
          </Text>
          <Text variant="meta" color="neutral700" style={styles.promoBody}>
            Tell us the service and your budget. Every available stylist within your radius gets the
            request — you pick from whoever accepts.
          </Text>
          <Button label="Post a request" onPress={openRequest} block arrow />
        </Card>
      </Screen>

      <Sheet
        open={roleSheetOpen}
        onClose={() => {
          setRoleSheetOpen(false);
        }}
      >
        <Text variant="cardTitle" style={styles.sheetTitle}>
          {isProvider ? 'Switch to client' : 'Switch to provider'}
        </Text>
        <Text variant="body" color="neutral700" style={styles.sheetBody}>
          One account, two sides.{' '}
          {hasProviderProfile
            ? 'Switch any time.'
            : "You don't have a provider page yet — set one up with a category, area, hours and a service. ID and selfie verification comes later."}
        </Text>

        {roleError ? (
          <Text
            variant="meta"
            color={color.accent700}
            style={styles.sheetBody}
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
          >
            {roleError}
          </Text>
        ) : null}

        <View style={styles.sheetActions}>
          {/* Switching is offered only when there is already a provider page
              to switch to; setting one up is offered only when there isn't
              — the two are mutually exclusive, never both, never neither. */}
          {hasProviderProfile ? (
            <Button
              label={
                setActiveRole.isPending
                  ? 'Switching…'
                  : isProvider
                    ? 'Switch to client'
                    : 'Switch to provider'
              }
              block
              disabled={setActiveRole.isPending}
              onPress={() => {
                void switchRole();
              }}
            />
          ) : (
            <Button
              label="Set up my page"
              block
              arrow
              onPress={() => {
                setRoleSheetOpen(false);
                router.push('/provider-setup');
              }}
            />
          )}
          <Button
            label={hasProviderProfile ? 'Not now' : 'Close'}
            variant="ghost"
            block
            onPress={() => {
              setRoleError(null);
              setRoleSheetOpen(false);
            }}
          />
        </View>
      </Sheet>
    </>
  );
}

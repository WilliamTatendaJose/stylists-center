import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { MapPin, Compass } from 'lucide-react-native';
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
} from '@sc/ui';
import { useCategories } from '../../src/api/hooks/useCategories.js';
import { useNearbyProviders } from '../../src/api/hooks/useProviders.js';
import { useRequestStore, useSessionStore } from '../../src/state/index.js';

const styles = StyleSheet.create({
  header: { gap: 8 },
  headerTop: { flexDirection: 'row', alignItems: 'center' },
  wordmark: { marginRight: 'auto' },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  hero: { marginBottom: space.l },
  searchRow: { flexDirection: 'row', gap: space.s, alignItems: 'center', marginBottom: layout.section },
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
});

export default function Find() {
  const { data: categories } = useCategories();
  const { data: providers } = useNearbyProviders();
  const activeRole = useSessionStore((s) => s.activeRole);
  const hasProviderProfile = useSessionStore((s) => s.hasProviderProfile);
  const setCategory = useRequestStore((s) => s.setCategory);
  const [roleSheetOpen, setRoleSheetOpen] = useState(false);

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
      </View>
      <View style={styles.locationRow}>
        <MapPin size={12} strokeWidth={1.8} color={color.accent} />
        <Text variant="meta" color="neutral700">
          Avondale, Harare · located
        </Text>
      </View>
    </View>
  );

  return (
    <>
      <Screen hasTabBar header={header}>
        <Text variant="h2" style={styles.hero}>
          Book the hands{'\n'}you actually want.
        </Text>

        <View style={styles.searchRow}>
          <SearchField placeholder="Looking for a good braider…" onPress={goMap} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Search on the map"
            onPress={goMap}
            style={styles.mapButton}
          >
            <Compass size={18} strokeWidth={1.7} color={color.bg} />
          </Pressable>
        </View>

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
        {providers?.map((p) => (
          <ListRow
            key={p.id}
            avatar={{ initials: p.initials, tint: p.tint, size: 54 }}
            title={p.displayName}
            meta={`${p.categoryName} · ${p.areaName}`}
            subMeta={`${p.ratingAvg.toFixed(1)} ★ · ${String(p.completedCount)} done`}
            rightPrimary={`from $${(p.fromPriceUsdCents / 100).toFixed(0)}`}
            rightCaption={`${p.distanceKm.toFixed(1)} km`}
            onPress={() => {
              router.push({ pathname: '/provider/[id]', params: { id: p.id, back: '/(tabs)' } });
            }}
          />
        ))}

        <View style={styles.spacer} />
        <Card bordered style={styles.promoCard}>
          <Text variant="sectionLabel" color={color.accent} style={styles.promoKicker}>
            Smart match
          </Text>
          <Text variant="cardTitle" style={styles.promoTitle}>
            Don&apos;t browse. Let them come to you.
          </Text>
          <Text variant="meta" color="neutral700" style={styles.promoBody}>
            Tell us the service and your budget. Every available stylist within your radius gets
            the request — you pick from whoever accepts.
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
          Switch to provider
        </Text>
        <Text variant="body" color="neutral700" style={styles.sheetBody}>
          One account, two sides.{' '}
          {hasProviderProfile
            ? 'Switch any time.'
            : "You don't have a provider page yet — we'll walk you through it: profile, services, hours, then ID and a selfie to get verified."}
        </Text>
        <View style={styles.sheetActions}>
          <Button
            label="Set up my provider page"
            block
            onPress={() => {
              setRoleSheetOpen(false);
            }}
          />
          <Button
            label="Stay as a client"
            variant="ghost"
            block
            onPress={() => {
              setRoleSheetOpen(false);
            }}
          />
        </View>
      </Sheet>
    </>
  );
}

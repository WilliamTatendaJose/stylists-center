import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, LocateFixed } from 'lucide-react-native';
import { color, radius, space } from '@sc/tokens';
import { isBrowseRadiusKm } from '@sc/shared';
import { ScMap, Text, Pressable, ListRow, Button } from '@sc/ui';
import { useCategories } from '../../src/api/hooks/useCategories.js';
import { useGeoSearch } from '../../src/api/hooks/useGeo.js';
import { useSessionStore } from '../../src/state/index.js';
import { useBack } from '../../src/navigation/useBack.js';

const styles = StyleSheet.create({
  root: { flex: 1 },
  map: { ...StyleSheet.absoluteFill },
  topRow: {
    position: 'absolute',
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s,
  },
  circleButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: color.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    backgroundColor: color.bg,
    borderRadius: radius.pill,
    paddingVertical: 10,
    paddingHorizontal: space.l,
  },
  locateButton: { position: 'absolute', right: 20 },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: color.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: space.s,
  },
  sheetPeek: { height: '56%' },
  sheetExpanded: { height: '90%' },
  dragHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: color.divider,
    marginBottom: space.m,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: space.l,
    marginBottom: space.s,
  },
  list: { paddingHorizontal: space.l },
});

/**
 * Map search (handoff screen 12) — full-bleed map, so this bypasses Screen
 * entirely (its scrolling-body/fixed-header model doesn't fit a floating
 * overlay layout) and manages its own status bar and safe-area insets.
 */
export default function MapSearch() {
  const { categoryId: categoryIdParam, radiusKm: radiusKmParam } = useLocalSearchParams<{
    categoryId?: string;
    radiusKm?: string;
  }>();
  const onBack = useBack('/(tabs)');
  const insets = useSafeAreaInsets();
  const location = useSessionStore((s) => s.location);
  const areaLabel = useSessionStore((s) => s.areaLabel);
  // The same "within N km" preference as Find/Market (DistanceFilter),
  // not a hardcoded 3 km — this screen used to ignore that setting
  // entirely, so widening it everywhere else never changed what the map
  // itself searched. An explicit radiusKm param (e.g. a future deep link)
  // still wins if present and valid.
  const maxDistanceKm = useSessionStore((s) => s.maxDistanceKm);
  const { data: categories } = useCategories();

  const parsedRadius = radiusKmParam ? Number(radiusKmParam) : NaN;
  const radiusKm = isBrowseRadiusKm(parsedRadius) ? parsedRadius : maxDistanceKm;
  const { data: geo } = useGeoSearch(radiusKm, categoryIdParam);
  const [expanded, setExpanded] = useState(false);

  const categoryName = categories?.find((c) => c.id === categoryIdParam)?.name ?? 'Stylists';
  const list = geo?.list ?? [];
  const tintById = new Map(list.map((p) => [p.id, p.tint]));

  const markers = (geo?.pins ?? []).map((pin) => ({
    id: pin.id,
    lngLat: [pin.location.lng, pin.location.lat] as [number, number],
    variant: 'pin' as const,
    initials: pin.initials,
    tint: tintById.get(pin.id),
    onPress: () => {
      router.push({ pathname: '/provider/[id]', params: { id: pin.id, back: '/map/search' } });
    },
  }));

  const goDirections = (providerId: string) => {
    router.push({ pathname: '/map/directions', params: { id: providerId } });
  };

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <ScMap
        center={[location.lng, location.lat]}
        zoom={14}
        radiusKm={radiusKm}
        markers={markers}
        style={styles.map}
      />

      <View style={[styles.topRow, { top: insets.top + 12 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={onBack}
          style={styles.circleButton}
        >
          <ChevronLeft size={20} strokeWidth={1.9} color={color.text} />
        </Pressable>
        <View style={styles.pill}>
          {/* Was a literal "near Avondale" regardless of where the device
              actually was — areaLabel is the same real, reverse-geocoded
              place name the Find header shows. */}
          <Text variant="bodyStrong" numberOfLines={1}>
            {categoryName} near {areaLabel ?? 'you'}
          </Text>
          <Text variant="metaSmall" color={color.accent}>
            {radiusKm} km
          </Text>
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Centre on my location"
        onPress={() => {
          /* ScMap already centres on the session location; wiring a moved-away
             recentre needs the map to report its live camera position, which
             this M1 wrapper doesn't expose yet. */
        }}
        style={[styles.circleButton, styles.locateButton, { top: insets.top + 64 }]}
      >
        <LocateFixed size={18} strokeWidth={1.9} color={color.accent} />
      </Pressable>

      <View style={[styles.sheet, expanded ? styles.sheetExpanded : styles.sheetPeek]}>
        <View style={styles.dragHandle} />
        <View style={styles.sheetHeader}>
          <Text variant="sectionLabel">{list.length} stylists on the map</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={expanded ? 'Map view' : 'List view'}
            onPress={() => {
              setExpanded((e) => !e);
            }}
          >
            <Text variant="metaSmall" color={color.accent700}>
              {expanded ? 'Map view' : 'List view'}
            </Text>
          </Pressable>
        </View>
        <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
          {list.map((provider) => (
            <ListRow
              key={provider.id}
              avatar={{ initials: provider.initials, tint: provider.tint, size: 40 }}
              title={provider.displayName}
              meta={`${provider.categoryName} · ${provider.distanceKm.toFixed(1)} km · from $${(
                provider.fromPriceUsdCents / 100
              ).toFixed(0)}`}
              right={
                <Button
                  label="Directions"
                  variant="secondary"
                  onPress={() => {
                    goDirections(provider.id);
                  }}
                />
              }
              onPress={() => {
                router.push({
                  pathname: '/provider/[id]',
                  params: { id: provider.id, back: '/map/search' },
                });
              }}
            />
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { ChevronLeft, LocateFixed, MapPin } from 'lucide-react-native';
import { space } from '@sc/tokens';
import { ScMap, SearchField, Text, Pressable, Button, useTheme, type ScMapLngLat } from '@sc/ui';
import { formatAreaLabel } from '../../src/location/useDeviceLocation.js';
import { useLocationPickerStore, useSessionStore } from '../../src/state/index.js';

const SEARCH_ZOOM = 16;

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
    alignItems: 'center',
    justifyContent: 'center',
  },
  locateButton: { position: 'absolute', right: 20 },
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: space.l,
    paddingTop: space.xl,
  },
  panelRow: { flexDirection: 'row', alignItems: 'center', gap: space.s, marginBottom: space.l },
  panelText: { flex: 1, minWidth: 0 },
  hint: { marginTop: space.s },
  searchSpinner: { position: 'absolute', right: 20 },
});

/**
 * Map location picker. Three ways to land on a point, all landing on the same
 * `picked` pin so any of them can be corrected by any other:
 *  1. Type an address and search it (forward geocode) — jumps the map there.
 *  2. "Use my current location" — jumps the map to the device's GPS fix.
 *  3. Tap the map directly — the manual-adjustment path, always available,
 *     including right after 1 or 2 to nudge a result that landed close but
 *     not exact.
 *
 * Pushed from provider setup / My page whenever "Area" needs a real
 * coordinate rather than a typed guess — the result goes back through
 * useLocationPickerStore rather than route params, since the caller reads it
 * after this screen pops, not before it mounts.
 */
export default function PickLocation() {
  const { lat: latParam, lng: lngParam } = useLocalSearchParams<{ lat?: string; lng?: string }>();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const sessionLocation = useSessionStore((s) => s.location);
  const setResult = useLocationPickerStore((s) => s.setResult);

  const initialLat = latParam ? Number(latParam) : NaN;
  const initialLng = lngParam ? Number(lngParam) : NaN;
  const initialCenter: ScMapLngLat =
    Number.isFinite(initialLat) && Number.isFinite(initialLng)
      ? [initialLng, initialLat]
      : [sessionLocation.lng, sessionLocation.lat];

  const [picked, setPicked] = useState<ScMapLngLat>(initialCenter);
  // Separate from `picked`: a manual tap should drop the pin exactly where
  // the finger landed without also snapping the camera there (it's already
  // on screen). Only a jump — search or current-location — needs to move the
  // camera, since those can land far outside the current viewport.
  const [mapCenter, setMapCenter] = useState<{ coord: ScMapLngLat; zoom: number }>({
    coord: initialCenter,
    zoom: 14,
  });
  const [areaName, setAreaName] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [addressQuery, setAddressQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const resolveAreaName = async (coord: ScMapLngLat) => {
    setResolving(true);
    try {
      const [address] = await Location.reverseGeocodeAsync({
        latitude: coord[1],
        longitude: coord[0],
      });
      setAreaName(address ? formatAreaLabel(address) : null);
    } catch {
      setAreaName(null);
    } finally {
      setResolving(false);
    }
  };

  // Labels the starting pin (e.g. reopening the picker on an already-set
  // profile address) instead of leaving it as a bare "Dropped pin".
  useEffect(() => {
    void resolveAreaName(initialCenter);
    // Only ever the coordinates this screen was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickPoint = (coord: ScMapLngLat) => {
    setPicked(coord);
    void resolveAreaName(coord);
  };

  const jumpTo = (coord: ScMapLngLat, zoom = SEARCH_ZOOM) => {
    setMapCenter({ coord, zoom });
    pickPoint(coord);
  };

  const locateCurrentPosition = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== Location.PermissionStatus.GRANTED) return;
      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      jumpTo([current.coords.longitude, current.coords.latitude]);
    } catch {
      // Best-effort — the map stays where it was, and the person can still
      // tap to drop a pin by hand.
    } finally {
      setLocating(false);
    }
  };

  const searchAddress = async () => {
    const query = addressQuery.trim();
    if (!query) return;
    setSearching(true);
    setSearchError(null);
    try {
      const results = await Location.geocodeAsync(query);
      const [hit] = results;
      if (!hit) {
        setSearchError("Couldn't find that address. Try refining it, or tap the map instead.");
        return;
      }
      jumpTo([hit.longitude, hit.latitude]);
    } catch {
      setSearchError('Address search is unavailable right now. Tap the map to choose a spot.');
    } finally {
      setSearching(false);
    }
  };

  const confirm = () => {
    setResult({ lat: picked[1], lng: picked[0], areaName });
    router.back();
  };

  return (
    <View style={styles.root}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <ScMap
        center={mapCenter.coord}
        zoom={mapCenter.zoom}
        markers={[{ id: 'picked', lngLat: picked, variant: 'destination' }]}
        onMapPress={pickPoint}
        style={styles.map}
      />

      <View style={[styles.topRow, { top: insets.top + 12 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          onPress={() => router.back()}
          style={[styles.circleButton, { backgroundColor: colors.bg }]}
        >
          <ChevronLeft size={20} strokeWidth={1.9} color={colors.text} />
        </Pressable>
        <SearchField
          value={addressQuery}
          onChangeText={(value) => {
            setAddressQuery(value);
            setSearchError(null);
          }}
          placeholder="Search an address"
          returnKeyType="search"
          onSubmitEditing={() => void searchAddress()}
        />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Use my current location"
        disabled={locating}
        onPress={() => void locateCurrentPosition()}
        style={[
          styles.circleButton,
          styles.locateButton,
          { top: insets.top + 64, backgroundColor: colors.bg },
        ]}
      >
        {locating ? (
          <ActivityIndicator size="small" color={colors.accent} />
        ) : (
          <LocateFixed size={18} strokeWidth={1.9} color={colors.accent} />
        )}
      </Pressable>

      {searching ? (
        <View
          style={[
            styles.circleButton,
            styles.searchSpinner,
            { top: insets.top + 116, backgroundColor: colors.bg },
          ]}
        >
          <ActivityIndicator size="small" color={colors.accent} />
        </View>
      ) : null}

      <View
        style={[
          styles.panel,
          { backgroundColor: colors.bg, paddingBottom: insets.bottom + space.l },
        ]}
      >
        {searchError ? (
          <Text
            variant="meta"
            color={colors.accent700}
            style={styles.hint}
            accessibilityLiveRegion="polite"
          >
            {searchError}
          </Text>
        ) : null}
        <View style={styles.panelRow}>
          <MapPin size={20} color={colors.accent} strokeWidth={1.9} />
          <View style={styles.panelText}>
            {resolving ? (
              <Text variant="meta" color="neutral700">
                Finding this address…
              </Text>
            ) : (
              <Text variant="bodyStrong" numberOfLines={1}>
                {areaName ?? 'Dropped pin'}
              </Text>
            )}
            <Text variant="metaSmall" color="neutral600">
              {picked[1].toFixed(5)}, {picked[0].toFixed(5)}
            </Text>
          </View>
        </View>
        <Text
          variant="metaSmall"
          color="neutral600"
          style={[styles.hint, { marginBottom: space.l }]}
        >
          Not quite right? Tap anywhere on the map to move the pin.
        </Text>
        <Button label="Use this location" block size="lg" onPress={confirm} />
      </View>
    </View>
  );
}

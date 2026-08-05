import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { MAX_BROWSE_RADIUS_KM, MIN_BROWSE_RADIUS_KM } from '@sc/shared';
import { space } from '@sc/tokens';
import { RangeInput, Text } from '@sc/ui';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import { useSessionStore } from '../state/index.js';

const styles = StyleSheet.create({
  wrap: { marginBottom: space.m },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
});

/**
 * The "within N km" browse filter shared by Find and Market — a free 1-50 km
 * slider, not the fixed 1/3/8 smart-match ladder (see radius.ts). Previously
 * this picker only ever offered three rungs because it shared a type with
 * that unrelated ladder; there was never a way to ask for 10, 25, or 50 km.
 *
 * `maxDistanceKm` drives a live query key (category counts, "available now",
 * search, the map), so committing on every native slider tick would fire a
 * network request per pixel of drag. The slider's own visible value tracks
 * every tick locally for a smooth thumb; only the debounced value is written
 * back to the session store.
 */
export function DistanceFilter() {
  const maxDistanceKm = useSessionStore((s) => s.maxDistanceKm);
  const setMaxDistanceKm = useSessionStore((s) => s.setMaxDistanceKm);

  const [liveKm, setLiveKm] = useState(maxDistanceKm);
  // Stays in sync if the store's value changes for a reason other than this
  // slider's own drag — e.g. Market's slider moving while Find is mounted in
  // the background, since React Navigation tabs are kept alive, not remounted.
  useEffect(() => {
    setLiveKm(maxDistanceKm);
  }, [maxDistanceKm]);

  const debouncedKm = useDebouncedValue(liveKm, 400);
  useEffect(() => {
    if (debouncedKm !== maxDistanceKm) setMaxDistanceKm(debouncedKm);
  }, [debouncedKm, maxDistanceKm, setMaxDistanceKm]);

  return (
    <View style={styles.wrap}>
      <View style={styles.labelRow}>
        <Text variant="meta" color="neutral700">
          Within
        </Text>
        <Text variant="metaSmall" color="neutral600">
          {Math.round(liveKm)} km
        </Text>
      </View>
      <RangeInput
        min={MIN_BROWSE_RADIUS_KM}
        max={MAX_BROWSE_RADIUS_KM}
        step={1}
        value={liveKm}
        onChange={setLiveKm}
        accessibilityLabel="Maximum distance to search"
      />
    </View>
  );
}

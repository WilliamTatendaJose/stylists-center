import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  clampBrowseRadiusKm,
  DEFAULT_BROWSE_RADIUS_KM,
  MAX_BROWSE_RADIUS_KM,
  MIN_BROWSE_RADIUS_KM,
} from '@sc/shared';
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
  const safeStoreValue = Number.isFinite(maxDistanceKm)
    ? clampBrowseRadiusKm(maxDistanceKm)
    : DEFAULT_BROWSE_RADIUS_KM;

  const [liveKm, setLiveKm] = useState(safeStoreValue);
  // True between the user moving THIS slider and its value being saved.
  // Find and Market each keep a slider mounted (tabs stay alive). Before this
  // flag, an idle slider still holding the old distance wrote it back the
  // moment the other slider saved a new one, the other wrote its value back,
  // and the two looped until React stopped with "Maximum update depth
  // exceeded" — the crash on changing the radius. Only a slider the user
  // actually moved may write to the store.
  const userMoved = useRef(false);

  // Follows the store when the distance changes for another reason (the
  // other tab's slider), unless the user is mid-drag on this one.
  useEffect(() => {
    if (!userMoved.current) setLiveKm(safeStoreValue);
  }, [safeStoreValue]);

  const debouncedKm = useDebouncedValue(liveKm, 400);
  useEffect(() => {
    if (!userMoved.current || debouncedKm !== liveKm) return;
    userMoved.current = false;
    const nextValue = Number.isFinite(debouncedKm)
      ? clampBrowseRadiusKm(Math.round(debouncedKm))
      : DEFAULT_BROWSE_RADIUS_KM;
    if (nextValue !== useSessionStore.getState().maxDistanceKm) setMaxDistanceKm(nextValue);
    // Reads the store directly rather than depending on it, so a store change
    // can never re-run this and write an old value back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedKm, liveKm]);

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
        onChange={(value) => {
          if (!Number.isFinite(value)) return;
          userMoved.current = true;
          setLiveKm(clampBrowseRadiusKm(Math.round(value)));
        }}
        accessibilityLabel="Maximum distance to search"
      />
    </View>
  );
}

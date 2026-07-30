import { useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { StyleSpecification } from '@maplibre/maplibre-gl-style-spec';
import { Map as MapLibreMap, Camera, GeoJSONSource, Layer, Marker } from '@maplibre/maplibre-react-native';
import { circle } from '@turf/circle';
import { along } from '@turf/along';
import { length as turfLength } from '@turf/length';
import { lineString } from '@turf/helpers';
import { color, radius } from '@sc/tokens';
import { Text } from '../primitives/Text.js';

export type ScMapLngLat = [lng: number, lat: number];

export interface ScMapMarker {
  id: string;
  lngLat: ScMapLngLat;
  /** `pin` = a provider (black pill, tinted initials disc). `destination` = the same shape inverted (accent pill). `dot` = the self/trip position dot with its halo. */
  variant: 'pin' | 'destination' | 'dot';
  initials?: string;
  tint?: string;
  onPress?: () => void;
}

export interface ScMapProps {
  center: ScMapLngLat;
  zoom?: number;
  markers?: ScMapMarker[];
  /** Draws the smart-match/map-search radius circle around `center`. */
  radiusKm?: number;
  /** The dashed "as the crow flies" route line (plan §5 — not real street routing). */
  routeCoordinates?: ScMapLngLat[];
  /**
   * 0..1 along `routeCoordinates` — renders an animated position dot at that
   * point. The caller advances this (a simulation timer in M1; a
   * `trip.location` socket event in Phase 3) — this component only
   * interpolates, it never owns trip state.
   */
  tripProgress?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * `tile.openstreetmap.org` usage policy forbids bulk/offline downloading —
 * fine for this sandbox's development use, but plan risk R1 flags that a real
 * tile vendor (MapTiler, self-hosted Protomaps) must be chosen before launch.
 * Kept as one named constant so that swap is a one-line change.
 */
const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

const RASTER_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    'osm-raster': {
      type: 'raster',
      tiles: [OSM_TILE_URL],
      tileSize: 256,
    },
  },
  layers: [{ id: 'osm-raster-layer', type: 'raster', source: 'osm-raster' }],
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
  map: { flex: 1 },
  markerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.pill,
    padding: 3,
  },
  markerPillDark: { backgroundColor: color.neutral900 },
  markerPillAccent: { backgroundColor: color.accent },
  markerDisc: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerDiscTintedByProvider: { backgroundColor: color.accent },
  markerDiscOnAccent: { backgroundColor: color.neutral900 },
  dotHalo: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: color.accent,
    opacity: 0.2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotCore: { width: 12, height: 12, borderRadius: 6, backgroundColor: color.accent },
  attribution: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    backgroundColor: color.mapOverlayBg,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
});

function PinMarker({ initials, tint, inverted }: { initials?: string; tint?: string; inverted: boolean }) {
  const pillStyle = inverted ? styles.markerPillAccent : styles.markerPillDark;
  const discStyle = inverted ? styles.markerDiscOnAccent : styles.markerDiscTintedByProvider;
  const discFill = !inverted && tint ? { backgroundColor: tint } : null;
  const textColor = inverted ? color.bg : color.bg;

  return (
    <View style={[styles.markerPill, pillStyle]}>
      <View style={[styles.markerDisc, discStyle, discFill]}>
        <Text variant="metaSmall" color={textColor}>
          {initials ?? ''}
        </Text>
      </View>
    </View>
  );
}

function DotMarker() {
  return (
    <View style={styles.dotHalo}>
      <View style={styles.dotCore} />
    </View>
  );
}

/**
 * MapLibre native map wrapper — every map screen in the app renders through
 * this, never `@maplibre/maplibre-react-native` directly (plan §5). Renders
 * its own permanent attribution overlay rather than relying on the library's
 * native attribution button, since a licence requirement needs to be
 * something a unit test can assert on.
 */
export function ScMap({ center, zoom = 15, markers = [], radiusKm, routeCoordinates, tripProgress, style }: ScMapProps) {
  const radiusFeature = useMemo(() => {
    if (radiusKm === undefined) return null;
    return circle(center, radiusKm, { steps: 64, units: 'kilometers' });
  }, [center, radiusKm]);

  const routeFeature = useMemo(() => {
    if (!routeCoordinates || routeCoordinates.length < 2) return null;
    return lineString(routeCoordinates);
  }, [routeCoordinates]);

  const tripPoint = useMemo(() => {
    if (!routeFeature || tripProgress === undefined) return null;
    const totalKm = turfLength(routeFeature, { units: 'kilometers' });
    const point = along(routeFeature, totalKm * Math.min(1, Math.max(0, tripProgress)), {
      units: 'kilometers',
    });
    return point.geometry.coordinates as ScMapLngLat;
  }, [routeFeature, tripProgress]);

  return (
    <View style={[styles.fill, style]}>
      <MapLibreMap mapStyle={RASTER_STYLE} style={styles.map} attribution={false} logo={false} compass={false}>
        <Camera center={center} zoom={zoom} />

        {radiusFeature ? (
          <GeoJSONSource id="sc-radius" data={radiusFeature}>
            <Layer
              id="sc-radius-fill"
              type="fill"
              paint={{ 'fill-color': color.accent, 'fill-opacity': 0.05 }}
            />
            <Layer id="sc-radius-line" type="line" paint={{ 'line-color': color.accent, 'line-width': 1 }} />
          </GeoJSONSource>
        ) : null}

        {routeFeature ? (
          <GeoJSONSource id="sc-route" data={routeFeature}>
            <Layer
              id="sc-route-line"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{
                'line-color': color.accent,
                'line-width': 3,
                'line-dasharray': [2, 7],
              }}
            />
          </GeoJSONSource>
        ) : null}

        {markers.map((marker) => (
          <Marker key={marker.id} id={marker.id} lngLat={marker.lngLat} onPress={marker.onPress}>
            {marker.variant === 'dot' ? (
              <DotMarker />
            ) : (
              <PinMarker
                initials={marker.initials}
                tint={marker.tint}
                inverted={marker.variant === 'destination'}
              />
            )}
          </Marker>
        ))}

        {tripPoint ? (
          <Marker id="sc-trip-dot" lngLat={tripPoint}>
            <DotMarker />
          </Marker>
        ) : null}
      </MapLibreMap>

      <View style={styles.attribution}>
        <Text variant="metaSmall" color={color.neutral700}>
          © OpenStreetMap contributors
        </Text>
      </View>
    </View>
  );
}

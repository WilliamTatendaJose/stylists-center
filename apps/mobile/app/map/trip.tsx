import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { ChevronLeft, MessageCircle } from 'lucide-react-native';
import { color, layout, radius, space } from '@sc/tokens';
import { formatInHarare } from '@sc/shared';
import { Screen, Text, Pressable, Avatar, StatTile, ScMap, LiveDot, Button } from '@sc/ui';
import { useProvider } from '../../src/api/hooks/useProviders.js';
import { useRoute } from '../../src/api/hooks/useGeo.js';
import { useSessionStore, useTripStore } from '../../src/state/index.js';
import { useBack } from '../../src/navigation/useBack.js';

/** Balanced accuracy and a 15 m/4 s floor are plenty for a walking/kombi trip and easier on battery than High. */
const LOCATION_ACCURACY = Location.Accuracy.Balanced;
const LOCATION_UPDATE_INTERVAL_MS = 4000;
const LOCATION_UPDATE_DISTANCE_M = 15;
/** Real GPS won't land exactly on the destination coordinate — this close counts as arrived. */
const ARRIVAL_RADIUS_KM = 0.15;

interface LatLng {
  lat: number;
  lng: number;
}

function haversineKm(a: LatLng, b: LatLng): number {
  const EARTH_RADIUS_KM = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  mapPane: { position: 'relative' },
  map: { ...StyleSheet.absoluteFill },
  circleButton: {
    position: 'absolute',
    left: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: color.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  livePill: {
    position: 'absolute',
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: color.neutral900,
    borderRadius: radius.pill,
    paddingVertical: 8,
    paddingHorizontal: space.m,
  },
  scroll: { flex: 1 },
  content: { paddingHorizontal: layout.screenX, paddingTop: space.xl, paddingBottom: space.xl },
  kicker: { marginBottom: space.xs },
  heading: { marginBottom: space.s },
  body: { marginBottom: space.xxl },
  statRow: { flexDirection: 'row', gap: space.s, marginBottom: space.xxl },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    marginBottom: space.xxl,
  },
  contactMiddle: { flex: 1, minWidth: 0 },
  messageButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: color.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: { marginBottom: space.xxl },
  sectionLabel: { marginBottom: space.m },
  stepRow: { flexDirection: 'row', gap: space.m, marginBottom: space.m },
  stepDistance: { width: 34 },
  stepText: { flex: 1 },
  note: { marginBottom: space.l },
  footer: {
    flexDirection: 'row',
    gap: space.s,
    paddingHorizontal: layout.screenX,
    paddingTop: space.ml,
    borderTopWidth: 1,
    borderTopColor: color.divider,
  },
  footerButton: { flex: 1 },
});

/** Trip live, client variant (handoff screen 14). */
export default function Trip() {
  const { id: providerId } = useLocalSearchParams<{ id: string }>();
  const onBack = useBack('/(tabs)/bookings');
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const location = useSessionStore((s) => s.location);
  const arrived = useTripStore((s) => s.arrived);
  const etaShared = useTripStore((s) => s.etaShared);
  const setArrived = useTripStore((s) => s.setArrived);
  const setEtaShared = useTripStore((s) => s.setEtaShared);
  const resetTrip = useTripStore((s) => s.reset);

  const { data: provider } = useProvider(providerId);
  const { data: route } = useRoute(providerId);

  // The device's own real position, watched for as long as this screen is
  // mounted — not a simulation. Null until the first fix lands, so every
  // consumer below falls back to the last known session location.
  const [liveLocation, setLiveLocation] = useState<LatLng | null>(null);

  useEffect(() => {
    let subscription: Location.LocationSubscription | undefined;
    let cancelled = false;

    void (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== Location.PermissionStatus.GRANTED || cancelled) return;
      subscription = await Location.watchPositionAsync(
        {
          accuracy: LOCATION_ACCURACY,
          timeInterval: LOCATION_UPDATE_INTERVAL_MS,
          distanceInterval: LOCATION_UPDATE_DISTANCE_M,
        },
        (position) => {
          setLiveLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
        },
      );
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, []);

  // Tolerates `route`/`liveLocation` still being unset — the render-time
  // values below the loading guard are what actually display progress; this
  // only flips `arrived` the moment a real fix lands within the radius.
  useEffect(() => {
    if (!route || !liveLocation || arrived) return;
    if (haversineKm(liveLocation, route.destination) <= ARRIVAL_RADIUS_KM) {
      setArrived(true);
    }
  }, [route, liveLocation, arrived, setArrived]);

  useEffect(() => resetTrip, [resetTrip]);

  if (!provider || !route) {
    return (
      <Screen>
        <Text variant="body" color="neutral700">
          Loading…
        </Text>
      </Screen>
    );
  }

  const destination = route.destination;
  const currentPosition = liveLocation ?? location;
  const firstName = provider.displayName.split(' ')[0] ?? provider.displayName;
  const remainingKm = arrived ? 0 : haversineKm(currentPosition, destination);
  const progress = Math.min(1, Math.max(0, 1 - remainingKm / Math.max(route.distanceKm, 0.001)));
  const toGoMinutes = Math.max(0, Math.round(route.etaMinutes * (1 - progress)));
  const arriveAtIso = new Date(Date.now() + toGoMinutes * 60_000).toISOString();

  const shareEta = () => {
    setEtaShared(true);
  };

  const primaryAction = () => {
    if (arrived) {
      resetTrip();
      router.replace('/(tabs)/bookings');
      return;
    }
    // "Tell her I'm close" — a courtesy nudge, mocked; nothing to persist in M1.
  };

  const goMessage = () => {
    router.push({ pathname: '/chat/[threadId]', params: { threadId: providerId, providerId } });
  };

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <View style={[styles.mapPane, { height: windowHeight * 0.46 }]}>
        <ScMap
          center={[currentPosition.lng, currentPosition.lat]}
          zoom={13}
          routeCoordinates={route.coordinates}
          markers={[
            {
              id: 'self',
              lngLat: [currentPosition.lng, currentPosition.lat],
              variant: 'dot',
            },
            {
              id: providerId,
              lngLat: [destination.lng, destination.lat],
              variant: 'destination',
              initials: provider.initials,
              tint: provider.tint,
            },
          ]}
          style={styles.map}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={onBack}
          style={[styles.circleButton, { top: insets.top + 12 }]}
        >
          <ChevronLeft size={20} strokeWidth={1.9} color={color.text} />
        </Pressable>
        {liveLocation ? (
          <View style={[styles.livePill, { top: insets.top + 12 }]}>
            <LiveDot onDark />
            <Text variant="metaSmall" color={color.onDark.text}>
              Live
            </Text>
          </View>
        ) : null}
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <Text variant="kicker" color={color.accent} style={styles.kicker}>
            On your way
          </Text>
          <Text variant="h2Small" style={styles.heading}>
            {arrived ? 'You have arrived.' : `Heading to ${firstName}.`}
          </Text>
          <Text variant="body" color="neutral700" style={styles.body}>
            {arrived
              ? `${firstName} has been told you are outside. Check in so the appointment starts.`
              : 'She can see your ETA, so a late kombi will not cost you the slot.'}
          </Text>

          <View style={styles.statRow}>
            <StatTile value={`${route.etaMinutes} min`} caption="ETA" />
            <StatTile value={`${toGoMinutes} min`} caption="To go" />
            <StatTile value={formatInHarare(arriveAtIso, 'HH:mm')} caption="Arrive" />
          </View>

          <View style={styles.contactRow}>
            <Avatar initials={provider.initials} tint={provider.tint} size={44} />
            <View style={styles.contactMiddle}>
              <Text variant="cardTitle">{provider.displayName}</Text>
              <Text variant="meta" color="neutral700">
                {provider.areaName}, Harare
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Message ${provider.displayName}`}
              onPress={goMessage}
              style={styles.messageButton}
            >
              <MessageCircle size={17} strokeWidth={1.8} color={color.text} />
            </Pressable>
          </View>

          <View style={styles.section}>
            <Text variant="sectionLabel" style={styles.sectionLabel}>
              The way there
            </Text>
            {route.steps.map((step, index) => (
              <View key={`${step.distanceLabel}-${String(index)}`} style={styles.stepRow}>
                <Text variant="bodyStrong" color={color.accent} style={styles.stepDistance}>
                  {step.distanceLabel}
                </Text>
                <Text variant="body" color="neutral700" style={styles.stepText}>
                  {step.text}
                </Text>
              </View>
            ))}
          </View>

          <Text variant="metaSmall" color="neutral600" style={styles.note}>
            Live position is shared only for this trip and stops when you check in.
          </Text>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
        <Button
          label={etaShared ? 'ETA sent' : 'Share ETA'}
          variant="secondary"
          disabled={etaShared}
          style={styles.footerButton}
          onPress={shareEta}
        />
        <Button
          label={arrived ? 'Check in' : "Tell her I'm close"}
          style={styles.footerButton}
          onPress={primaryAction}
        />
      </View>
    </View>
  );
}

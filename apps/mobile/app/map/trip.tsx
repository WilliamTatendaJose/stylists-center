import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, MessageCircle } from 'lucide-react-native';
import { color, layout, radius, space } from '@sc/tokens';
import { formatInHarare } from '@sc/shared';
import { Screen, Text, Pressable, Avatar, StatTile, ScMap, LiveDot, Button } from '@sc/ui';
import { useProvider } from '../../src/api/hooks/useProviders.js';
import { useRoute } from '../../src/api/hooks/useGeo.js';
import { PROVIDER_CONVERSATION_ID, PROVIDER_LOCATIONS } from '../../src/fixtures/index.js';
import { useSessionStore, useTripStore } from '../../src/state/index.js';
import { useBack } from '../../src/navigation/useBack.js';

const SIM_TICK_MS = 200;
const SIM_STEP = 0.02;

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

  // M1 simulation hook (plan §5): a timer advances this 0..1 progress value.
  // Phase 3 feeds the same ScMap `tripProgress` prop from `trip.location`
  // socket events instead — the map component itself doesn't change.
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (arrived) return;
    const interval = setInterval(() => {
      setProgress((p) => {
        const next = p + SIM_STEP;
        if (next >= 1) {
          clearInterval(interval);
          setArrived(true);
          return 1;
        }
        return next;
      });
    }, SIM_TICK_MS);
    return () => {
      clearInterval(interval);
    };
  }, [arrived, setArrived]);

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

  const destination = PROVIDER_LOCATIONS[providerId] ?? { lat: location.lat, lng: location.lng };
  const firstName = provider.displayName.split(' ')[0] ?? provider.displayName;
  const toGoMinutes = Math.max(0, Math.round(route.etaMinutes * (1 - progress)));
  const arriveAtIso = new Date(Date.now() + route.etaMinutes * 60_000).toISOString();

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
    const threadId = PROVIDER_CONVERSATION_ID[providerId] ?? providerId;
    router.push({ pathname: '/chat/[threadId]', params: { threadId } });
  };

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <View style={[styles.mapPane, { height: windowHeight * 0.46 }]}>
        <ScMap
          center={[location.lng, location.lat]}
          zoom={13}
          routeCoordinates={[
            [location.lng, location.lat],
            [destination.lng, destination.lat],
          ]}
          tripProgress={progress}
          markers={[
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
        <View style={[styles.livePill, { top: insets.top + 12 }]}>
          <LiveDot onDark />
          <Text variant="metaSmall" color={color.onDark.text}>
            Live
          </Text>
        </View>
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

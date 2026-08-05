import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { formatUsd } from '@sc/shared';
import { Screen, ScreenHeader, Text, Avatar, StatTile, ScMap, Button } from '@sc/ui';
import { color, radius, space } from '@sc/tokens';
import { useProvider } from '../../src/api/hooks/useProviders.js';
import { useRoute } from '../../src/api/hooks/useGeo.js';
import { useSessionStore } from '../../src/state/index.js';
import { useBack } from '../../src/navigation/useBack.js';

const styles = StyleSheet.create({
  mapPane: { borderRadius: radius.card, overflow: 'hidden', marginBottom: space.xxl },
  destinationRow: {
    flexDirection: 'row',
    gap: space.m,
    alignItems: 'center',
    marginBottom: space.xxl,
  },
  destinationMiddle: { flex: 1, minWidth: 0 },
  statRow: { flexDirection: 'row', gap: space.s, marginBottom: space.xxl },
  section: { marginBottom: space.xxl },
  sectionLabel: { marginBottom: space.m },
  stepRow: { flexDirection: 'row', gap: space.m, marginBottom: space.m },
  stepDistance: { width: 34 },
  stepText: { flex: 1 },
  note: { marginTop: space.s },
  footerRow: { flexDirection: 'row', gap: space.s },
  footerButton: { flex: 1 },
});

/** Directions (handoff screen 13). */
export default function Directions() {
  const { id: providerId } = useLocalSearchParams<{ id: string }>();
  const onBack = useBack('/(tabs)');
  const { height: windowHeight } = useWindowDimensions();
  const location = useSessionStore((s) => s.location);

  const { data: provider } = useProvider(providerId);
  const { data: route } = useRoute(providerId);

  if (!provider || !route) {
    return (
      <Screen header={<ScreenHeader title="Getting there" onBack={onBack} />}>
        <Text variant="body" color="neutral700">
          Loading…
        </Text>
      </Screen>
    );
  }

  const destination = route.destination;
  const mapPaneStyle = { height: windowHeight * 0.44 };

  const goMessage = () => {
    router.push({ pathname: '/chat/[threadId]', params: { threadId: providerId, providerId } });
  };

  const startNavigation = () => {
    router.push({ pathname: '/map/trip', params: { id: providerId } });
  };

  return (
    <Screen
      header={
        <ScreenHeader
          title="Getting there"
          onBack={onBack}
          right={
            <Text variant="bodyStrong" color={color.accent}>
              {route.etaMinutes} min
            </Text>
          }
        />
      }
      footer={
        <View style={styles.footerRow}>
          <Button
            label="Message"
            variant="secondary"
            style={styles.footerButton}
            onPress={goMessage}
          />
          <Button
            label="Start navigation"
            arrow
            style={styles.footerButton}
            onPress={startNavigation}
          />
        </View>
      }
    >
      <View style={[styles.mapPane, mapPaneStyle]}>
        <ScMap
          center={[location.lng, location.lat]}
          zoom={13}
          routeCoordinates={route.coordinates}
          markers={[
            {
              id: 'self',
              lngLat: [location.lng, location.lat],
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
        />
      </View>

      <View style={styles.destinationRow}>
        <Avatar initials={provider.initials} tint={provider.tint} size={44} />
        <View style={styles.destinationMiddle}>
          <Text variant="cardTitle">{provider.displayName}</Text>
          <Text variant="meta" color="neutral700">
            {provider.areaName}, Harare · exact plot shared before the slot
          </Text>
        </View>
      </View>

      <View style={styles.statRow}>
        <StatTile value={`${route.distanceKm.toFixed(1)} km`} caption="Distance" />
        <StatTile value={`${route.etaMinutes} min`} caption="Driving" />
        <StatTile value={formatUsd(route.kombiFareUsdCents)} caption="Kombi" />
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
        Exact plot number is shared two hours before the appointment. Share your live location with
        a friend from the booking if you&apos;d like.
      </Text>
    </Screen>
  );
}

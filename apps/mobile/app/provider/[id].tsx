import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { MapPin, ChevronRight } from 'lucide-react-native';
import { color, space } from '@sc/tokens';
import type { ReportReason } from '@sc/shared';
import {
  Screen,
  ScreenHeader,
  Text,
  Pressable,
  Avatar,
  Badge,
  StatTile,
  ImagePlaceholder,
  Button,
  ReportSheet,
} from '@sc/ui';
import { useProvider } from '../../src/api/hooks/useProviders.js';
import { useBookingDraftStore } from '../../src/state/index.js';
import { PROVIDER_CONVERSATION_ID } from '../../src/fixtures/index.js';
import { useBack } from '../../src/navigation/useBack.js';

const styles = StyleSheet.create({
  reportedNote: { marginBottom: space.m },
  identity: { alignItems: 'flex-start', marginBottom: space.l },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: space.m },
  meta: { marginTop: 2, marginBottom: space.s },
  statRow: { flexDirection: 'row', gap: space.s, marginBottom: space.xxl },
  sectionLabel: { marginBottom: space.m },
  section: { marginBottom: space.xxl },
  photoRow: { flexDirection: 'row', gap: 8 },
  photoLeft: { flex: 1, height: 248 },
  photoRight: { flex: 1, gap: 8 },
  photoRightTop: { height: 150 },
  photoRightBottom: { height: 90 },
  serviceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: space.ml,
  },
  serviceRowDivider: { borderBottomWidth: 1, borderBottomColor: color.divider },
  fromPanel: {
    borderWidth: 1,
    borderColor: color.divider,
    borderRadius: 20,
    padding: space.l,
  },
  fromPanelBody: { marginTop: space.xs },
  reviewRow: { marginBottom: space.l },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  directionsRow: { flexDirection: 'row', alignItems: 'center', gap: space.m, marginBottom: space.l },
  directionsMiddle: { flex: 1 },
  footerRow: { flexDirection: 'row', gap: space.s },
  bookButton: { flex: 1 },
});

/**
 * Provider profile (handoff screen 5). Reachable from Home, Map search, and
 * an accepted smart-match offer — each of those call sites passes an
 * explicit `back` param (see useBack), since a plain stack pop is only
 * correct for one of the three.
 */
export default function ProviderProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const onBack = useBack('/(tabs)');
  const { data: provider } = useProvider(id);
  const setProvider = useBookingDraftStore((s) => s.setProvider);

  const [reportSheetOpen, setReportSheetOpen] = useState(false);
  const [lastReport, setLastReport] = useState<ReportReason | null>(null);

  const submitReport = (reason: ReportReason) => {
    setLastReport(reason);
  };

  const goMessage = () => {
    const threadId = id ? (PROVIDER_CONVERSATION_ID[id] ?? id) : undefined;
    if (!threadId) return;
    router.push({ pathname: '/chat/[threadId]', params: { threadId } });
  };

  const goBook = () => {
    if (!id) return;
    setProvider(id);
    router.push('/book/slot');
  };

  const goDirections = () => {
    if (!id) return;
    router.push({ pathname: '/map/directions', params: { id } });
  };

  if (!provider) {
    return (
      <Screen header={<ScreenHeader title="Provider" onBack={onBack} />}>
        <Text variant="body" color="neutral700">
          Loading…
        </Text>
      </Screen>
    );
  }

  return (
    <>
      <Screen
        header={
          <ScreenHeader
            title={provider.displayName}
            onBack={onBack}
            right={
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Report a problem"
                onPress={() => {
                  setReportSheetOpen(true);
                }}
              >
                <Text variant="meta" color="neutral700">
                  Report
                </Text>
              </Pressable>
            }
          />
        }
        footer={
          <View style={styles.footerRow}>
            <Button label="Message" variant="secondary" size="lg" onPress={goMessage} />
            <Button label="Book" size="lg" onPress={goBook} style={styles.bookButton} />
          </View>
        }
      >
        {lastReport ? (
          <Text variant="meta" color={color.accent700} style={styles.reportedNote}>
            Report sent — thanks for the heads up.
          </Text>
        ) : null}

        <View style={styles.identity}>
          <Avatar initials={provider.initials} tint={provider.tint} size={78} />
          <View style={styles.nameRow}>
            <Text variant="h3">{provider.displayName}</Text>
            {provider.verified ? <Badge label="ID verified" tone="accent100" /> : null}
          </View>
          <Text variant="meta" color="neutral700" style={styles.meta}>
            {provider.categoryName} · {provider.areaName} · {provider.distanceKm.toFixed(1)} km
          </Text>
        </View>

        <View style={styles.statRow}>
          <StatTile value={provider.ratingAvg.toFixed(1)} caption="Rating" />
          <StatTile value={String(provider.completedCount)} caption="Completed" />
          <StatTile value={String(provider.yearsExperience)} caption="Years" />
        </View>

        <View style={styles.section}>
          <Text variant="sectionLabel" style={styles.sectionLabel}>
            Work
          </Text>
          <View style={styles.photoRow}>
            <ImagePlaceholder radius={18} style={styles.photoLeft} label="Portfolio" />
            <View style={styles.photoRight}>
              <ImagePlaceholder radius={18} style={styles.photoRightTop} />
              <ImagePlaceholder radius={18} style={styles.photoRightBottom} />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text variant="sectionLabel" style={styles.sectionLabel}>
            Services
          </Text>
          {provider.priceDisplay === 'list' ? (
            provider.services.map((service, index) => (
              <View
                key={service.id}
                style={[
                  styles.serviceRow,
                  index < provider.services.length - 1 ? styles.serviceRowDivider : null,
                ]}
              >
                <View>
                  <Text variant="body">{service.name}</Text>
                  <Text variant="meta" color="neutral600">
                    {service.durationMinutes} min
                  </Text>
                </View>
                <Text variant="bodyStrong">${(service.priceUsdCents / 100).toFixed(0)}</Text>
              </View>
            ))
          ) : (
            <View style={styles.fromPanel}>
              <Text variant="h3">${((provider.fromPriceUsdCents ?? 0) / 100).toFixed(0)} and up</Text>
              <Text variant="meta" color="neutral700" style={styles.fromPanelBody}>
                Final price agreed in chat before you pay.
              </Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text variant="sectionLabel" style={styles.sectionLabel}>
            Recent reviews
          </Text>
          {provider.reviews.map((review) => (
            <View key={review.id} style={styles.reviewRow}>
              <View style={styles.reviewHeader}>
                <Text variant="bodyStrong">{review.authorName}</Text>
                <Text variant="bodyStrong" color={color.accent700}>
                  {review.rating} ★
                </Text>
              </View>
              <Text variant="body" color="neutral700">
                {review.text}
              </Text>
            </View>
          ))}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="See it on the map and get directions"
          onPress={goDirections}
          style={styles.directionsRow}
        >
          <MapPin size={16} strokeWidth={1.8} color={color.accent} />
          <View style={styles.directionsMiddle}>
            <Text variant="body">
              {provider.areaName} · {provider.distanceKm.toFixed(1)} km from you
            </Text>
            <Text variant="meta" color="neutral600">
              See it on the map and get directions
            </Text>
          </View>
          <ChevronRight size={18} strokeWidth={1.8} color={color.neutral600} />
        </Pressable>

        <Text variant="meta" color="neutral600">
          {provider.workingHoursLabel}
        </Text>
      </Screen>

      <ReportSheet
        open={reportSheetOpen}
        onClose={() => {
          setReportSheetOpen(false);
        }}
        onSubmit={submitReport}
      />
    </>
  );
}

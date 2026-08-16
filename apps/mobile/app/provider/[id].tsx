import { useState } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { MapPin, ChevronRight } from 'lucide-react-native';
import { space } from '@sc/tokens';
import { deriveInitials, type ReportReason } from '@sc/shared';
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
  useTheme,
} from '@sc/ui';
import { useProvider } from '../../src/api/hooks/useProviders.js';
import { useCreateReport } from '../../src/api/hooks/useReports.js';
import { describeError } from '../../src/api/errorMessage.js';
import { apiAssetUrl } from '../../src/api/client.js';
import { useBookingDraftStore } from '../../src/state/index.js';
import { useBack } from '../../src/navigation/useBack.js';
import { FullScreenImageViewer } from '../../src/components/FullScreenImageViewer.js';

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
  photoExtras: { flexDirection: 'row', gap: 8, marginTop: 8 },
  photoExtra: { flex: 1, height: 110 },
  photoFill: { flex: 1 },
  serviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    paddingVertical: space.ml,
  },
  serviceText: { flex: 1, minWidth: 0 },
  serviceRowDivider: { borderBottomWidth: 1 },
  fromPanel: {
    borderWidth: 1,
    borderRadius: 20,
    padding: space.l,
  },
  fromPanelBody: { marginTop: space.xs },
  reviewRow: { marginBottom: space.l },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  loadErrorNote: { marginBottom: space.m },
  directionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    marginBottom: space.l,
  },
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
  const { colors } = useTheme();
  const { id, matchId } = useLocalSearchParams<{ id: string; matchId?: string }>();
  const onBack = useBack('/(tabs)');
  const { data: provider, isError: providerError, refetch: refetchProvider } = useProvider(id);
  const setProvider = useBookingDraftStore((s) => s.setProvider);

  const [reportSheetOpen, setReportSheetOpen] = useState(false);
  const [reportOutcome, setReportOutcome] = useState<{ ok: boolean; message: string } | null>(null);
  const [selectedWorkIndex, setSelectedWorkIndex] = useState<number | null>(null);
  const createReport = useCreateReport();

  // Same false-confirmation the Bookings screen had: the thank-you was shown
  // before the request resolved, so a report that never landed still told the
  // user it had.
  const submitReport = (reason: ReportReason) => {
    if (!id) return;
    createReport.mutate(
      { providerId: id, reason },
      {
        onSuccess: () => {
          setReportOutcome({ ok: true, message: 'Report sent — thanks for the heads up.' });
        },
        onError: (error) => {
          setReportOutcome({
            ok: false,
            message: describeError(error, "Couldn't send that report. Please try again."),
          });
        },
      },
    );
  };

  const goMessage = () => {
    if (!id) return;
    router.push({ pathname: '/chat/[threadId]', params: { threadId: id, providerId: id } });
  };

  const goBook = () => {
    if (!id) return;
    setProvider(id, matchId ?? null);
    router.push('/book/slot');
  };

  const goDirections = () => {
    if (!id) return;
    router.push({ pathname: '/map/directions', params: { id } });
  };

  if (!provider) {
    // Same failure this screen used to share with directions.tsx: a request
    // that never resolves reads identically to "still loading" with no way
    // out short of leaving the screen. A real failure now gets its own
    // message and a button that actually retries.
    return (
      <Screen header={<ScreenHeader title="Provider" onBack={onBack} />}>
        {providerError ? (
          <>
            <Text variant="body" color="neutral700" style={styles.loadErrorNote}>
              Couldn&apos;t load this stylist. Check your connection and try again.
            </Text>
            <Button label="Try again" onPress={() => void refetchProvider()} />
          </>
        ) : (
          <Text variant="body" color="neutral700">
            Loading…
          </Text>
        )}
      </Screen>
    );
  }

  const workImageUrls = provider.portfolioImageUrls
    .map((url) => apiAssetUrl(url))
    .filter((url): url is string => Boolean(url));
  const renderWorkPhoto = (
    url: string | undefined,
    index: number,
    style: ViewStyle,
    label?: string,
  ) => {
    const uri = apiAssetUrl(url);
    if (!uri) {
      return <ImagePlaceholder uri={undefined} radius={18} style={style} label={label} />;
    }
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`View work photo ${String(index + 1)} full screen`}
        onPress={() => setSelectedWorkIndex(index)}
        style={style}
      >
        <ImagePlaceholder uri={uri} radius={18} style={styles.photoFill} />
      </Pressable>
    );
  };

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
        {reportOutcome ? (
          <Text
            variant="meta"
            color={reportOutcome.ok ? 'neutral700' : colors.accent700}
            style={styles.reportedNote}
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
          >
            {reportOutcome.message}
          </Text>
        ) : null}

        <View style={styles.identity}>
          <Avatar
            initials={provider.initials}
            tint={provider.tint}
            uri={apiAssetUrl(provider.profileImageUrl ?? provider.portfolioImageUrls[0])}
            size={78}
          />
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
            {renderWorkPhoto(
              provider.portfolioImageUrls[0],
              0,
              styles.photoLeft,
              provider.portfolioImageUrls.length ? undefined : 'No work photos yet',
            )}
            <View style={styles.photoRight}>
              {renderWorkPhoto(provider.portfolioImageUrls[1], 1, styles.photoRightTop)}
              {renderWorkPhoto(provider.portfolioImageUrls[2], 2, styles.photoRightBottom)}
            </View>
          </View>
          {provider.portfolioImageUrls.length > 3 ? (
            <View style={styles.photoExtras}>
              {provider.portfolioImageUrls
                .slice(3)
                .map((url, index) => renderWorkPhoto(url, index + 3, styles.photoExtra))}
            </View>
          ) : null}
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
                  index < provider.services.length - 1
                    ? [styles.serviceRowDivider, { borderBottomColor: colors.divider }]
                    : null,
                ]}
              >
                <Avatar
                  initials={deriveInitials(service.name)}
                  uri={apiAssetUrl(service.imageUrls?.[0])}
                  size={58}
                />
                <View style={styles.serviceText}>
                  <Text variant="body">{service.name}</Text>
                  <Text variant="meta" color="neutral600">
                    {service.durationMinutes} min
                  </Text>
                </View>
                <Text variant="bodyStrong">${(service.priceUsdCents / 100).toFixed(0)}</Text>
              </View>
            ))
          ) : (
            <View style={[styles.fromPanel, { borderColor: colors.divider }]}>
              <Text variant="h3">
                ${((provider.fromPriceUsdCents ?? 0) / 100).toFixed(0)} and up
              </Text>
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
                <Text variant="bodyStrong" color={colors.accent700}>
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
          <MapPin size={16} strokeWidth={1.8} color={colors.accent} />
          <View style={styles.directionsMiddle}>
            <Text variant="body">
              {provider.areaName} · {provider.distanceKm.toFixed(1)} km from you
            </Text>
            <Text variant="meta" color="neutral600">
              See it on the map and get directions
            </Text>
          </View>
          <ChevronRight size={18} strokeWidth={1.8} color={colors.neutral600} />
        </Pressable>

        <Text variant="meta" color="neutral600">
          {provider.workingHoursLabel}
        </Text>
      </Screen>

      <FullScreenImageViewer
        urls={workImageUrls}
        initialIndex={selectedWorkIndex}
        onClose={() => setSelectedWorkIndex(null)}
        onPrevious={() =>
          setSelectedWorkIndex((current) =>
            current === null ? null : Math.max(0, current - 1),
          )
        }
        onNext={() =>
          setSelectedWorkIndex((current) =>
            current === null ? null : Math.min(workImageUrls.length - 1, current + 1),
          )
        }
      />

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

import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Star } from 'lucide-react-native';
import { color, space } from '@sc/tokens';
import {
  BOOKING_STATUS_LABELS,
  formatUsd,
  needsCashReconciliation,
  type BookingRowDto,
  type ReportReason,
} from '@sc/shared';
import {
  Screen,
  ScreenHeader,
  Text,
  Pressable,
  Avatar,
  Badge,
  Button,
  Card,
  Sheet,
  ReportSheet,
  EmptyPanel,
} from '@sc/ui';
import { useConfirmCompletion, useCreateReview, useMyBookings } from '../../src/api/hooks/useBookings.js';
import { useCreateReport } from '../../src/api/hooks/useReports.js';

const STARS = [1, 2, 3, 4, 5];

const styles = StyleSheet.create({
  reportedNote: { marginBottom: space.m },
  card: { padding: space.l, marginBottom: space.m },
  headerRow: { flexDirection: 'row', gap: space.m },
  middle: { flex: 1, minWidth: 0 },
  meta: { marginTop: 2 },
  actionsRow: { flexDirection: 'row', gap: space.s, marginTop: space.m },
  actionButton: { flex: 1 },
  reconcilePanel: {
    marginTop: space.m,
    padding: space.l,
    borderRadius: 16,
    backgroundColor: color.surface,
  },
  reconcileBody: { marginTop: space.xs, marginBottom: space.m },
  footerNote: { marginTop: space.l },
  rateTitle: { marginBottom: space.l },
  starsRow: { flexDirection: 'row', gap: space.s, marginBottom: space.xl },
});

/** Bookings (handoff screen 9): awaiting-stylist, cash-reconciliation, and completed row states. */
export default function Bookings() {
  const { data: bookings = [] } = useMyBookings();
  const confirmCompletion = useConfirmCompletion();
  const createReview = useCreateReview();
  const createReport = useCreateReport();

  const [rateTarget, setRateTarget] = useState<BookingRowDto | null>(null);
  const [rating, setRating] = useState(0);
  const [reportTarget, setReportTarget] = useState<BookingRowDto | null>(null);
  const [lastReportReason, setLastReportReason] = useState<ReportReason | null>(null);

  const openRate = (booking: BookingRowDto) => {
    setRating(0);
    setRateTarget(booking);
  };

  const closeRate = () => {
    setRateTarget(null);
  };

  const submitRating = () => {
    if (rateTarget && rating > 0) {
      createReview.mutate(
        { bookingId: rateTarget.id, input: { rating } },
        { onSuccess: closeRate },
      );
      return;
    }
    closeRate();
  };

  const submitReport = (reason: ReportReason) => {
    if (reportTarget) {
      createReport.mutate({ providerId: reportTarget.providerId, bookingId: reportTarget.id, reason });
    }
    setLastReportReason(reason);
  };

  const goOnMyWay = (booking: BookingRowDto) => {
    router.push({ pathname: '/map/trip', params: { bookingId: booking.id, providerId: booking.providerId } });
  };

  const goDirections = (booking: BookingRowDto) => {
    router.push({ pathname: '/map/directions', params: { id: booking.providerId } });
  };

  return (
    <>
      <Screen hasTabBar header={<ScreenHeader title="Bookings" showBack={false} />}>
        {lastReportReason ? (
          <Text variant="meta" color={color.accent700} style={styles.reportedNote}>
            Report sent — thanks for the heads up.
          </Text>
        ) : null}

        {bookings.length === 0 ? (
          <EmptyPanel body="No bookings yet — find a stylist and send a request." />
        ) : (
          bookings.map((booking) => {
            const reconcile = needsCashReconciliation(booking);
            const statusLabel = reconcile
              ? 'Confirm it happened'
              : BOOKING_STATUS_LABELS[booking.status];
            const badgeTone = booking.status === 'awaiting_provider' ? 'accent' : 'neutral';
            const rated = !booking.canRate;

            return (
              <Card key={booking.id} bordered style={styles.card}>
                <View style={styles.headerRow}>
                  <Avatar initials={booking.initials} tint={booking.tint} size={44} />
                  <View style={styles.middle}>
                    <Text variant="cardTitle">{booking.counterpartyName}</Text>
                    <Text variant="meta" color="neutral700" style={styles.meta}>
                      {booking.serviceName} · {booking.whenLabel}
                    </Text>
                    <Text variant="metaSmall" color="neutral600">
                      {booking.paymentMethod === 'ecocash' ? 'EcoCash' : 'Cash'} ·{' '}
                      {formatUsd(booking.priceUsdCents)}
                    </Text>
                  </View>
                  <Badge label={statusLabel} tone={badgeTone} />
                </View>

                {booking.status === 'awaiting_provider' ? (
                  <View style={styles.actionsRow}>
                    <Button
                      label="I'm on my way"
                      variant="secondary"
                      style={styles.actionButton}
                      onPress={() => {
                        goOnMyWay(booking);
                      }}
                    />
                    <Button
                      label="Directions"
                      variant="secondary"
                      style={styles.actionButton}
                      onPress={() => {
                        goDirections(booking);
                      }}
                    />
                  </View>
                ) : null}

                {reconcile ? (
                  <View style={styles.reconcilePanel}>
                    <Text variant="bodyStrong">
                      Cash booking — confirm it happened so it closes cleanly for both of you.
                    </Text>
                    <Text variant="meta" color="neutral700" style={styles.reconcileBody}>
                      {booking.confirmedByProvider
                        ? `${booking.counterpartyName} has already confirmed.`
                        : `Waiting on ${booking.counterpartyName} — closes when you both confirm.`}
                    </Text>
                    <Button
                      label={booking.confirmedByClient ? 'Confirmed' : 'Yes, it happened'}
                      disabled={booking.confirmedByClient || confirmCompletion.isPending}
                      block
                      onPress={() => {
                        confirmCompletion.mutate(booking.id);
                      }}
                    />
                  </View>
                ) : null}

                {booking.status === 'completed' ? (
                  <View style={styles.actionsRow}>
                    <Button
                      label={rated ? 'Rated' : 'Rate stylist'}
                      disabled={rated}
                      style={styles.actionButton}
                      onPress={() => {
                        openRate(booking);
                      }}
                    />
                    <Button
                      label="Report a problem"
                      variant="ghost"
                      style={styles.actionButton}
                      onPress={() => {
                        setReportTarget(booking);
                      }}
                    />
                  </View>
                ) : null}
              </Card>
            );
          })
        )}

        <Text variant="metaSmall" color="neutral600" style={styles.footerNote}>
          Repeated no-shows — five, tracked by us — remove an account from Stylists Center. Every
          ban states its reason and can be appealed.
        </Text>
      </Screen>

      <Sheet open={!!rateTarget} onClose={closeRate}>
        <Text variant="cardTitle" style={styles.rateTitle}>
          Rate {rateTarget?.counterpartyName}
        </Text>
        <View style={styles.starsRow}>
          {STARS.map((n) => (
            <Pressable
              key={n}
              accessibilityRole="button"
              accessibilityLabel={`${String(n)} star${n > 1 ? 's' : ''}`}
              onPress={() => {
                setRating(n);
              }}
            >
              <Star
                size={30}
                strokeWidth={1.6}
                color={color.accent}
                fill={n <= rating ? color.accent : 'transparent'}
              />
            </Pressable>
          ))}
        </View>
        <Button
          label={createReview.isPending ? 'Submitting…' : 'Submit rating'}
          block
          disabled={rating === 0 || createReview.isPending}
          onPress={submitRating}
        />
      </Sheet>

      <ReportSheet
        open={!!reportTarget}
        onClose={() => {
          setReportTarget(null);
        }}
        onSubmit={submitReport}
      />
    </>
  );
}

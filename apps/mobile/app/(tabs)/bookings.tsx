import { useMemo, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Star } from 'lucide-react-native';
import { color, space } from '@sc/tokens';
import {
  BOOKING_STATUS_LABELS,
  FREE_CANCELLATION_WINDOW_HOURS,
  NO_SHOW_COUNT_FOR_AUTO_BAN,
  formatUsd,
  isLateCancellation,
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
  SectionLabel,
} from '@sc/ui';
import {
  useBookingUpdates,
  useCancelBooking,
  useConfirmCompletion,
  useCreateReview,
  useMyBookings,
} from '../../src/api/hooks/useBookings.js';
import { useCreateReport } from '../../src/api/hooks/useReports.js';
import { describeError } from '../../src/api/errorMessage.js';

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
  sheetError: { marginBottom: space.m },
  sheetBody: { marginBottom: space.xl },
  sheetActions: { gap: space.s },
});

interface BookingCardProps {
  booking: BookingRowDto;
  confirmPending: boolean;
  onConfirmCompletion: () => void;
  onRate: () => void;
  onReport: () => void;
  onCancel: () => void;
  onOnMyWay: () => void;
  onDirections: () => void;
}

function BookingCard({
  booking,
  confirmPending,
  onConfirmCompletion,
  onRate,
  onReport,
  onCancel,
  onOnMyWay,
  onDirections,
}: BookingCardProps) {
  const reconcile = needsCashReconciliation(booking);
  const statusLabel = reconcile ? 'Confirm it happened' : BOOKING_STATUS_LABELS[booking.status];
  const badgeTone = booking.status === 'awaiting_provider' ? 'accent' : 'neutral';
  const rated = !booking.canRate;

  return (
    <Card bordered style={styles.card}>
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

      {/* Driven by the server's `canTravel`, which the screen previously
          ignored in favour of its own status check — two rules for one
          decision, free to disagree. */}
      {booking.canTravel ? (
        <View style={styles.actionsRow}>
          <Button
            label="I'm on my way"
            variant="secondary"
            style={styles.actionButton}
            onPress={onOnMyWay}
          />
          <Button
            label="Directions"
            variant="secondary"
            style={styles.actionButton}
            onPress={onDirections}
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
            disabled={booking.confirmedByClient || confirmPending}
            block
            onPress={onConfirmCompletion}
          />
        </View>
      ) : null}

      {booking.status === 'completed' ? (
        <View style={styles.actionsRow}>
          <Button
            label={rated ? 'Rated' : 'Rate stylist'}
            disabled={rated}
            style={styles.actionButton}
            onPress={onRate}
          />
          <Button
            label="Report a problem"
            variant="ghost"
            style={styles.actionButton}
            onPress={onReport}
          />
        </View>
      ) : null}

      {/* Server-decided, not inferred from status here — the rule lives in
          @sc/shared so this button and the endpoint agree. */}
      {booking.canCancel ? (
        <Button label="Cancel booking" variant="ghost" block onPress={onCancel} />
      ) : null}
    </Card>
  );
}

/** Bookings (handoff screen 9): awaiting-stylist, cash-reconciliation, and completed row states. */
export default function Bookings() {
  const { data: bookings = [], isError, isLoading, refetch, isRefetching } = useMyBookings();
  const confirmCompletion = useConfirmCompletion();
  const createReview = useCreateReview();
  const createReport = useCreateReport();
  const cancelBooking = useCancelBooking();

  // A provider confirming an appointment now updates this screen live.
  useBookingUpdates();

  const [rateTarget, setRateTarget] = useState<BookingRowDto | null>(null);
  const [rating, setRating] = useState(0);
  const [rateError, setRateError] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<BookingRowDto | null>(null);
  const [reportOutcome, setReportOutcome] = useState<{ ok: boolean; message: string } | null>(null);
  const [cancelTarget, setCancelTarget] = useState<BookingRowDto | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const cancelIsLate = !!cancelTarget && isLateCancellation(cancelTarget.startsAt);

  /**
   * Split by appointment time rather than status: "is this still ahead of me"
   * is the question the screen answers, and it needs the machine-readable
   * `startsAt` the row now carries — `whenLabel` is display text that cannot
   * be compared.
   */
  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const isPast = (b: BookingRowDto) =>
      new Date(b.startsAt).getTime() < now ||
      b.status === 'completed' ||
      b.status === 'cancelled' ||
      b.status === 'declined';

    return {
      // Soonest first: the next appointment is the one being looked for.
      upcoming: bookings
        .filter((b) => !isPast(b))
        .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()),
      // Most recent first, which is how the API already returns them.
      past: bookings.filter(isPast),
    };
  }, [bookings]);

  const openRate = (booking: BookingRowDto) => {
    setRating(0);
    setRateTarget(booking);
  };

  const closeRate = () => {
    setRateTarget(null);
  };

  const submitRating = () => {
    if (!rateTarget || rating === 0) {
      closeRate();
      return;
    }
    setRateError(null);
    createReview.mutate(
      { bookingId: rateTarget.id, input: { rating } },
      {
        onSuccess: closeRate,
        // Previously a failed rating silently left the sheet open with no
        // explanation, so the only feedback was the button becoming tappable
        // again.
        onError: (error) => {
          setRateError(describeError(error, "Couldn't submit your rating. Try again."));
        },
      },
    );
  };

  const submitReport = (reason: ReportReason) => {
    if (!reportTarget) return;
    createReport.mutate(
      { providerId: reportTarget.providerId, bookingId: reportTarget.id, reason },
      {
        // "Report sent — thanks for the heads up" used to be shown
        // unconditionally, before the request resolved — so a report that
        // never reached the server still told the user it had. For a safety
        // feature that is the worst possible failure mode.
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

  const confirmCancel = () => {
    if (!cancelTarget) return;
    setCancelError(null);
    cancelBooking.mutate(cancelTarget.id, {
      onSuccess: () => {
        setCancelTarget(null);
      },
      onError: (error) => {
        setCancelError(describeError(error, "Couldn't cancel that booking. Try again."));
      },
    });
  };

  const goOnMyWay = (booking: BookingRowDto) => {
    router.push({
      pathname: '/map/trip',
      params: { bookingId: booking.id, providerId: booking.providerId },
    });
  };

  const goDirections = (booking: BookingRowDto) => {
    router.push({ pathname: '/map/directions', params: { id: booking.providerId } });
  };

  return (
    <>
      <Screen
        hasTabBar
        header={<ScreenHeader title="Bookings" showBack={false} />}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => {
              void refetch();
            }}
            tintColor={color.accent}
            colors={[color.accent]}
          />
        }
      >
        {reportOutcome ? (
          <Text
            variant="meta"
            color={reportOutcome.ok ? 'neutral700' : color.accent700}
            style={styles.reportedNote}
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
          >
            {reportOutcome.message}
          </Text>
        ) : null}

        {confirmError ? (
          <Text
            variant="meta"
            color={color.accent700}
            style={styles.reportedNote}
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
          >
            {confirmError}
          </Text>
        ) : null}

        {/* Only a hard failure earns the panel. An error over bookings we
            already have is a failed refresh, and burying a working list under
            it helps nobody. */}
        {isError && bookings.length === 0 ? (
          <EmptyPanel
            title="Couldn't load your bookings"
            body="Check your connection and pull down to try again."
          />
        ) : isError ? (
          <Text variant="meta" color="neutral700" style={styles.reportedNote}>
            Showing your last update — couldn&apos;t reach the server just now.
          </Text>
        ) : null}

        {!isError && bookings.length === 0 ? (
          <EmptyPanel
            body={
              isLoading
                ? 'Loading your bookings…'
                : 'No bookings yet — find a stylist and send a request.'
            }
          />
        ) : null}

        {/* Two groups rather than one stream: an appointment that has not
            happened yet needs different attention from a receipt, and mixing
            them buried the next one under history. */}
        {(
          [
            ['Upcoming', upcoming],
            ['Past', past],
          ] as const
        ).map(([label, group]) =>
          group.length === 0 ? null : (
            <View key={label}>
              <SectionLabel label={label} count={group.length} />
              {group.map((booking) => (
                <BookingCard
                  key={booking.id}
                  booking={booking}
                  confirmPending={confirmCompletion.isPending}
                  onConfirmCompletion={() => {
                    setConfirmError(null);
                    confirmCompletion.mutate(booking.id, {
                      onError: (error) => {
                        setConfirmError(
                          describeError(error, "Couldn't confirm that booking. Try again."),
                        );
                      },
                    });
                  }}
                  onRate={() => {
                    openRate(booking);
                  }}
                  onReport={() => {
                    setReportOutcome(null);
                    setReportTarget(booking);
                  }}
                  onCancel={() => {
                    setCancelError(null);
                    setCancelTarget(booking);
                  }}
                  onOnMyWay={() => {
                    goOnMyWay(booking);
                  }}
                  onDirections={() => {
                    goDirections(booking);
                  }}
                />
              ))}
            </View>
          ),
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
        {rateError ? (
          <Text
            variant="meta"
            color={color.accent700}
            style={styles.sheetError}
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
          >
            {rateError}
          </Text>
        ) : null}
        <Button
          label={createReview.isPending ? 'Submitting…' : 'Submit rating'}
          block
          disabled={rating === 0 || createReview.isPending}
          onPress={submitRating}
        />
      </Sheet>

      <Sheet
        open={!!cancelTarget}
        onClose={() => {
          setCancelTarget(null);
        }}
      >
        <Text variant="cardTitle" style={styles.rateTitle}>
          Cancel this booking?
        </Text>
        <Text variant="body" color="neutral700" style={styles.sheetBody}>
          {cancelTarget?.counterpartyName} will be told the slot is free
          {cancelTarget?.paymentMethod === 'ecocash'
            ? ', and the amount held for it goes back to you in full.'
            : '.'}
        </Text>

        {/* The consequence is disclosed before the decision, not after it.
            The same `isLateCancellation` the server uses decides this, so the
            warning can never disagree with what actually gets recorded. */}
        {cancelIsLate ? (
          <Text variant="meta" color={color.accent700} style={styles.sheetBody}>
            This is within {FREE_CANCELLATION_WINDOW_HOURS} hours of your appointment, so it counts
            against your account — {String(NO_SHOW_COUNT_FOR_AUTO_BAN)} of these and the account is
            removed. It still counts for less than not turning up at all.
          </Text>
        ) : (
          <Text variant="meta" color="neutral700" style={styles.sheetBody}>
            You&apos;re cancelling more than {FREE_CANCELLATION_WINDOW_HOURS} hours ahead, so this
            is free and nothing is recorded against you.
          </Text>
        )}

        {cancelError ? (
          <Text
            variant="meta"
            color={color.accent700}
            style={styles.sheetError}
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
          >
            {cancelError}
          </Text>
        ) : null}

        <View style={styles.sheetActions}>
          <Button
            label={cancelBooking.isPending ? 'Cancelling…' : 'Yes, cancel it'}
            block
            disabled={cancelBooking.isPending}
            onPress={confirmCancel}
          />
          <Button
            label="Keep the booking"
            variant="ghost"
            block
            onPress={() => {
              setCancelTarget(null);
            }}
          />
        </View>
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

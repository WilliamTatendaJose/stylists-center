import { memo, useCallback, useMemo, useState } from 'react';
import { RefreshControl, SectionList, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Star } from 'lucide-react-native';
import { space } from '@sc/tokens';
import {
  BOOKING_STATUS_LABELS,
  FREE_CANCELLATION_WINDOW_HOURS,
  NO_SHOW_COUNT_FOR_AUTO_BAN,
  canConfirmEcocashCompletion,
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
  TextField,
  useTheme,
} from '@sc/ui';
import {
  useBookingUpdates,
  useCancelBooking,
  useConfirmCompletion,
  useCreateReview,
  useMyBookings,
} from '../../src/api/hooks/useBookings.js';
import { useCreateReport } from '../../src/api/hooks/useReports.js';
import { useAppConfig } from '../../src/api/hooks/useAppConfig.js';
import { describeError } from '../../src/api/errorMessage.js';
import { apiAssetUrl } from '../../src/api/client.js';
import { RoleSwitcher } from '../../src/components/RoleSwitcher.js';
import { useBookingDraftStore } from '../../src/state/useBookingDraftStore.js';

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
  },
  reconcileBody: { marginTop: space.xs, marginBottom: space.m },
  footerNote: { marginTop: space.l },
  rateTitle: { marginBottom: space.l },
  starsRow: { flexDirection: 'row', gap: space.s, marginBottom: space.xl },
  sheetError: { marginBottom: space.m },
  sheetBody: { marginBottom: space.xl },
  sheetActions: { gap: space.s },
  reviewField: { marginBottom: space.s },
  reviewCount: { marginBottom: space.l },
});

/**
 * Row actions take the booking as an argument so ONE stable set of handlers
 * can serve every row — per-row closures would defeat `memo` on every render.
 */
interface BookingActions {
  onConfirmCompletion: (booking: BookingRowDto) => void;
  onRate: (booking: BookingRowDto) => void;
  onReport: (booking: BookingRowDto) => void;
  onCancel: (booking: BookingRowDto) => void;
  onOnMyWay: (booking: BookingRowDto) => void;
  onDirections: (booking: BookingRowDto) => void;
  onReschedule: (booking: BookingRowDto) => void;
  onBookAgain: (booking: BookingRowDto) => void;
}

interface BookingCardProps {
  booking: BookingRowDto;
  confirmPending: boolean;
  actions: BookingActions;
}

const BookingCard = memo(function BookingCard({
  booking,
  confirmPending,
  actions,
}: BookingCardProps) {
  const { colors } = useTheme();
  const onConfirmCompletion = () => {
    actions.onConfirmCompletion(booking);
  };
  const onRate = () => {
    actions.onRate(booking);
  };
  const onReport = () => {
    actions.onReport(booking);
  };
  const onCancel = () => {
    actions.onCancel(booking);
  };
  const onOnMyWay = () => {
    actions.onOnMyWay(booking);
  };
  const onDirections = () => {
    actions.onDirections(booking);
  };
  const onReschedule = () => {
    actions.onReschedule(booking);
  };
  const onBookAgain = () => {
    actions.onBookAgain(booking);
  };
  const { completionAutoConfirmHours } = useAppConfig();
  const reconcile = needsCashReconciliation(booking);
  const canCompleteEcocash = canConfirmEcocashCompletion(booking);
  // Bookings made before clients paid stylists directly were paid in the app.
  const paidInApp = booking.paymentMethod === 'ecocash';
  const statusLabel =
    reconcile || canCompleteEcocash ? 'Confirm job done' : BOOKING_STATUS_LABELS[booking.status];
  const badgeTone = booking.status === 'awaiting_provider' ? 'accent' : 'neutral';
  const rated = !booking.canRate;

  return (
    <Card bordered style={styles.card}>
      <View style={styles.headerRow}>
        <Avatar
          initials={booking.initials}
          tint={booking.tint}
          uri={apiAssetUrl(booking.imageUrl)}
          size={44}
        />
        <View style={styles.middle}>
          <Text variant="cardTitle">{booking.counterpartyName}</Text>
          <Text variant="meta" color="neutral700" style={styles.meta}>
            {booking.serviceName} · {booking.whenLabel}
          </Text>
          <Text variant="metaSmall" color="neutral600">
            {paidInApp
              ? `Paid in the app · ${formatUsd(booking.priceUsdCents)}`
              : booking.clientTotalUsdCents > booking.priceUsdCents
                ? `${formatUsd(booking.clientTotalUsdCents)} (includes ${formatUsd(booking.clientTotalUsdCents - booking.priceUsdCents)} service fee)`
                : formatUsd(booking.clientTotalUsdCents)}
          </Text>
          {!paidInApp && booking.coinsUsed > 0 ? (
            <Text variant="metaSmall" color="neutral600">
              {booking.coinsUsed} coins used (−{formatUsd(booking.coinsUsdCents)}) · you pay{' '}
              {formatUsd(booking.amountDueUsdCents)}
            </Text>
          ) : null}
          {/* Plain text on purpose: the number is for paying, and tapping to
              copy or dial from a booking card is a different feature. */}
          {!paidInApp && booking.providerPaymentPhone ? (
            <Text variant="metaSmall" color="neutral600">
              Pay {booking.counterpartyName} directly, in cash or to {booking.providerPaymentPhone}
            </Text>
          ) : null}
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
        <View style={[styles.reconcilePanel, { backgroundColor: colors.surface }]}>
          <Text variant="bodyStrong">
            Was the job done? Confirm it once you have had your appointment.
          </Text>
          <Text variant="meta" color="neutral700" style={styles.reconcileBody}>
            {booking.confirmedByProvider
              ? `${booking.counterpartyName} has confirmed they were paid.`
              : booking.confirmedByClient
                ? `Waiting on ${booking.counterpartyName} to confirm they were paid.`
                : `${booking.counterpartyName} confirms they were paid.`}{' '}
            If only one of you confirms, the booking closes by itself after{' '}
            {completionAutoConfirmHours} hours.
          </Text>
          <Button
            label={booking.confirmedByClient ? 'Confirmed' : 'Yes, the job was done'}
            disabled={booking.confirmedByClient || confirmPending}
            block
            onPress={onConfirmCompletion}
          />
        </View>
      ) : null}

      {/* EcoCash needs only the client's word — no back-and-forth with the
          stylist — but until now nothing surfaced that action at all, so a
          confirmed EcoCash booking had no route to "completed" outside the
          travel screens. */}
      {canCompleteEcocash ? (
        <View style={[styles.reconcilePanel, { backgroundColor: colors.surface }]}>
          <Text variant="bodyStrong">Had your appointment? Confirm it&apos;s done.</Text>
          <Text variant="meta" color="neutral700" style={styles.reconcileBody}>
            This is what releases the payment held for {booking.counterpartyName.split(' ')[0]}.
          </Text>
          <Button
            label={confirmPending ? 'Confirming…' : 'Mark as done'}
            disabled={confirmPending}
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
      {booking.canReschedule ? (
        <Button label="Change time" variant="secondary" block onPress={onReschedule} />
      ) : null}
      {['completed', 'declined', 'cancelled'].includes(booking.status) ? (
        <Button label="Book this service again" variant="ghost" block onPress={onBookAgain} />
      ) : null}
    </Card>
  );
});

interface BookingSection {
  title: 'Upcoming' | 'Past';
  data: BookingRowDto[];
}

const keyExtractor = (booking: BookingRowDto) => booking.id;

/** Bookings (handoff screen 9): awaiting-stylist, confirm-job-done, and completed row states. */
export default function Bookings() {
  const { colors } = useTheme();
  const { data: bookings = [], isError, isLoading, refetch, isRefetching } = useMyBookings();
  const confirmCompletion = useConfirmCompletion();
  const confirmMutate = confirmCompletion.mutate;
  const confirmPending = confirmCompletion.isPending;
  const createReview = useCreateReview();
  const createReport = useCreateReport();
  const cancelBooking = useCancelBooking();
  const startReschedule = useBookingDraftStore((s) => s.startReschedule);
  const setProvider = useBookingDraftStore((s) => s.setProvider);
  const setService = useBookingDraftStore((s) => s.setService);

  // A provider confirming an appointment now updates this screen live.
  useBookingUpdates();

  const [rateTarget, setRateTarget] = useState<BookingRowDto | null>(null);
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
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
      b.status === 'incomplete' ||
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

  const openRate = useCallback((booking: BookingRowDto) => {
    setRating(0);
    setReviewText('');
    setRateError(null);
    setRateTarget(booking);
  }, []);

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
      {
        bookingId: rateTarget.id,
        input: { rating, ...(reviewText.trim() ? { text: reviewText.trim() } : {}) },
      },
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

  const actions = useMemo<BookingActions>(
    () => ({
      onConfirmCompletion: (booking) => {
        setConfirmError(null);
        confirmMutate(booking.id, {
          onError: (error) => {
            setConfirmError(describeError(error, "Couldn't confirm that booking. Try again."));
          },
        });
      },
      onRate: openRate,
      onReport: (booking) => {
        setReportOutcome(null);
        setReportTarget(booking);
      },
      onCancel: (booking) => {
        setCancelError(null);
        setCancelTarget(booking);
      },
      onOnMyWay: (booking) => {
        router.push({ pathname: '/map/trip', params: { id: booking.providerId } });
      },
      onDirections: (booking) => {
        router.push({ pathname: '/map/directions', params: { id: booking.providerId } });
      },
      onReschedule: (booking) => {
        startReschedule(booking.id, booking.providerId, booking.serviceId);
        router.push('/book/slot');
      },
      onBookAgain: (booking) => {
        setProvider(booking.providerId);
        setService(booking.serviceId);
        router.push('/book/slot');
      },
    }),
    [confirmMutate, openRate, startReschedule, setProvider, setService],
  );

  // Two groups rather than one stream: an appointment that has not happened
  // yet needs different attention from a receipt, and mixing them buried the
  // next one under history.
  const sections = useMemo<BookingSection[]>(() => {
    const result: BookingSection[] = [];
    if (upcoming.length) result.push({ title: 'Upcoming', data: upcoming });
    if (past.length) result.push({ title: 'Past', data: past });
    return result;
  }, [upcoming, past]);

  const renderItem = useCallback(
    ({ item }: { item: BookingRowDto }) => (
      <BookingCard booking={item} confirmPending={confirmPending} actions={actions} />
    ),
    [confirmPending, actions],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: BookingSection }) => (
      <SectionLabel label={section.title} count={section.data.length} />
    ),
    [],
  );

  const listHeader = (
    <>
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

      {confirmError ? (
        <Text
          variant="meta"
          color={colors.accent700}
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
    </>
  );

  const listEmpty = !isError ? (
    <EmptyPanel
      body={
        isLoading
          ? 'Loading your bookings…'
          : 'No bookings yet — find a stylist and send a request.'
      }
    />
  ) : null;

  const listFooter = (
    <Text variant="metaSmall" color="neutral600" style={styles.footerNote}>
      Repeated no-shows — five, tracked by us — remove an account from Style Center. Every ban
      states its reason and can be appealed.
    </Text>
  );

  return (
    <>
      <Screen
        hasTabBar
        header={<ScreenHeader title="Bookings" showBack={false} right={<RoleSwitcher />} />}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => {
              void refetch();
            }}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
        renderList={(listProps) => (
          <SectionList
            {...listProps}
            sections={sections}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            renderSectionHeader={renderSectionHeader}
            stickySectionHeadersEnabled={false}
            extraData={confirmPending}
            ListHeaderComponent={listHeader}
            ListEmptyComponent={listEmpty}
            ListFooterComponent={listFooter}
          />
        )}
      />

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
                color={colors.accent}
                fill={n <= rating ? colors.accent : 'transparent'}
              />
            </Pressable>
          ))}
        </View>
        <View style={styles.reviewField}>
          <TextField
            label="Add a comment (optional)"
            value={reviewText}
            onChangeText={setReviewText}
            placeholder="What went well? Help other clients know what to expect."
            maxLength={500}
            multiline
            numberOfLines={4}
          />
        </View>
        <Text variant="metaSmall" color="neutral600" align="right" style={styles.reviewCount}>
          {reviewText.length}/500
        </Text>
        {rateError ? (
          <Text
            variant="meta"
            color={colors.accent700}
            style={styles.sheetError}
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
          >
            {rateError}
          </Text>
        ) : null}
        <Button
          label={createReview.isPending ? 'Submitting…' : 'Submit review'}
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
            : cancelTarget && cancelTarget.coinsUsed > 0
              ? `, and your ${String(cancelTarget.coinsUsed)} coins go back to you.`
              : '.'}
        </Text>

        {/* The consequence is disclosed before the decision, not after it.
            The same `isLateCancellation` the server uses decides this, so the
            warning can never disagree with what actually gets recorded. */}
        {cancelIsLate ? (
          <Text variant="meta" color={colors.accent700} style={styles.sheetBody}>
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
            color={colors.accent700}
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

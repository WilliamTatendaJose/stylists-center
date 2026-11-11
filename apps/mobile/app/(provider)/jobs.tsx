import { memo, useCallback, useMemo, useState } from 'react';
import { RefreshControl, SectionList, StyleSheet, View } from 'react-native';
import {
  BOOKING_STATUS_LABELS,
  formatUsd,
  type ProviderBookingRowDto,
  type ProviderOfferDto,
} from '@sc/shared';
import { space } from '@sc/tokens';
import {
  Screen,
  ScreenHeader,
  Text,
  Avatar,
  Badge,
  Button,
  Card,
  Toggle,
  Countdown,
  Sheet,
  TextField,
  SectionLabel,
  EmptyPanel,
  useTheme,
} from '@sc/ui';
import {
  useAcceptOffer,
  useConfirmBooking,
  useDeclineBooking,
  useDeclineOffer,
  useProviderConfirmCompletion,
  useProviderJobs,
  useProviderJobsRealtime,
  useReportNonPayment,
  useSetAvailability,
} from '../../src/api/hooks/useProviderJobs.js';
import { useAppConfig } from '../../src/api/hooks/useAppConfig.js';
import { describeError } from '../../src/api/errorMessage.js';
import { apiAssetUrl } from '../../src/api/client.js';
import { ServerConnectionPanel } from '../../src/components/ServerConnectionPanel.js';
import { RoleSwitcher } from '../../src/components/RoleSwitcher.js';

const styles = StyleSheet.create({
  availabilityCard: {
    padding: space.l,
    marginBottom: space.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
  },
  availabilityText: { flex: 1, minWidth: 0 },
  card: { padding: space.l, marginBottom: space.m },
  headerRow: { flexDirection: 'row', gap: space.m, alignItems: 'flex-start' },
  middle: { flex: 1, minWidth: 0 },
  meta: { marginTop: 2 },
  actionsRow: { flexDirection: 'row', gap: space.s, marginTop: space.m },
  actionButton: { flex: 1 },
  offerTop: { flexDirection: 'row', alignItems: 'center', gap: space.m },
  note: { marginBottom: space.m },
  reconcilePanel: {
    marginTop: space.m,
    padding: space.m,
    borderRadius: 16,
  },
  reconcileNote: { marginTop: space.s },
  sectionGap: { marginTop: space.xl },
  sheetTitle: { marginBottom: space.m },
  sheetBody: { marginBottom: space.l },
  sheetActions: { gap: space.s, marginTop: space.m },
});

const COMPLETED_HISTORY_PREVIEW_COUNT = 2;

/** A live smart-match offer: accept it and it becomes a booking, or it expires. */
const OfferCardRow = memo(function OfferCardRow({
  offer,
  pending,
  actions,
}: {
  offer: ProviderOfferDto;
  pending: boolean;
  actions: JobActions;
}) {
  const onAccept = () => {
    actions.acceptOffer(offer.id);
  };
  const onDecline = () => {
    actions.declineOffer(offer.id);
  };
  return (
    <Card bordered style={styles.card}>
      <View style={styles.offerTop}>
        <View style={styles.middle}>
          <Text variant="cardTitle">{offer.categoryName}</Text>
          <Text variant="meta" color="neutral700" style={styles.meta}>
            {offer.distanceKm.toFixed(1)} km away ·{' '}
            {offer.budgetUsdCents === null
              ? 'Flexible budget'
              : `Up to ${formatUsd(offer.budgetUsdCents)}`}
          </Text>
        </View>
        {/* The deadline is the whole point of an offer, so it counts down
            rather than sitting as a static timestamp. */}
        <Countdown expiresAt={offer.respondBy} caption="to reply" />
      </View>

      <View style={styles.actionsRow}>
        <Button label="Accept" style={styles.actionButton} disabled={pending} onPress={onAccept} />
        <Button
          label="Pass"
          variant="ghost"
          style={styles.actionButton}
          disabled={pending}
          onPress={onDecline}
        />
      </View>
    </Card>
  );
});

/**
 * Stable handlers keyed by id, shared by every row so `memo` holds. Created
 * once per mutation-function identity in the screen.
 */
interface JobActions {
  acceptOffer: (id: string) => void;
  declineOffer: (id: string) => void;
  confirmBooking: (id: string) => void;
  declineBooking: (id: string) => void;
  completeBooking: (id: string) => void;
  reportNonPayment: (booking: ProviderBookingRowDto) => void;
}

type JobSection = 'offers' | 'requests' | 'upcoming' | 'completed';

type JobItem =
  | { key: string; kind: 'offer'; offer: ProviderOfferDto }
  | {
      key: string;
      kind: 'booking';
      section: Exclude<JobSection, 'offers'>;
      booking: ProviderBookingRowDto;
    };

const JobCard = memo(function JobCard({
  booking,
  section,
  pending,
  actions,
}: {
  booking: ProviderBookingRowDto;
  section: Exclude<JobSection, 'offers'>;
  pending: boolean;
  actions: JobActions;
}) {
  const { colors } = useTheme();
  // Accept / decline are only wired for rows in "Waiting on you", and
  // "Mark as done" is inert in the read-only Completed history — the same
  // per-section wiring the screen had before it was virtualised.
  const onConfirm = () => {
    if (section === 'requests') actions.confirmBooking(booking.id);
  };
  const onDecline = () => {
    if (section === 'requests') actions.declineBooking(booking.id);
  };
  const onComplete = () => {
    if (section !== 'completed') actions.completeBooking(booking.id);
  };
  const onReportNonPayment = () => {
    actions.reportNonPayment(booking);
  };
  const { completionAutoConfirmHours } = useAppConfig();
  const paidInApp = booking.paymentMethod === 'ecocash';
  const firstName = booking.clientName.split(' ')[0];
  return (
    <Card bordered style={styles.card}>
      <View style={styles.headerRow}>
        <Avatar
          initials={initialsOf(booking.clientName)}
          tint={colors.neutral900}
          uri={apiAssetUrl(booking.clientImageUrl)}
          size={44}
        />
        <View style={styles.middle}>
          <Text variant="cardTitle">{booking.clientName}</Text>
          <Text variant="meta" color="neutral700" style={styles.meta}>
            {booking.serviceName} · {booking.whenLabel}
          </Text>
          <Text variant="metaSmall" color="neutral600">
            {paidInApp ? 'Paid in the app · ' : ''}
            {formatUsd(booking.priceUsdCents)} · {booking.reference}
          </Text>
          {!paidInApp ? (
            <Text variant="metaSmall" color="neutral600">
              {booking.amountToCollectUsdCents > 0
                ? `${firstName} pays you ${formatUsd(booking.amountToCollectUsdCents)}`
                : `${firstName} has nothing to pay you`}
              {booking.coinsUsed > 0
                ? ` after ${String(booking.coinsUsed)} coins (${formatUsd(booking.coinsUsdCents)}), which are added to your balance`
                : ''}
              {booking.serviceFeeUsdCents > 0
                ? `. Service fee ${formatUsd(booking.serviceFeeUsdCents)}, billed to you monthly.`
                : ''}
            </Text>
          ) : null}
          {booking.nonPaymentReportedAt ? (
            <Text variant="metaSmall" color="neutral600">
              You reported that {firstName} didn&apos;t pay. No fee for this job.
            </Text>
          ) : null}
        </View>
        <Badge
          label={BOOKING_STATUS_LABELS[booking.status]}
          tone={booking.status === 'awaiting_provider' ? 'accent' : 'neutral'}
        />
      </View>

      {booking.canConfirm || booking.canDecline ? (
        <View style={styles.actionsRow}>
          {booking.canConfirm ? (
            <Button
              label="Accept"
              style={styles.actionButton}
              disabled={pending}
              onPress={onConfirm}
            />
          ) : null}
          {booking.canDecline ? (
            <Button
              label="Decline"
              variant="ghost"
              style={styles.actionButton}
              disabled={pending}
              onPress={onDecline}
            />
          ) : null}
        </View>
      ) : null}

      {booking.canConfirmCompletion ? (
        <>
          <Button label="Payment received" block disabled={pending} onPress={onComplete} />
          <Text variant="metaSmall" color="neutral600" style={styles.reconcileNote}>
            Tap once {firstName} has paid you. The job closes when they confirm it was done too, or
            by itself {completionAutoConfirmHours} hours after one of you confirms.
          </Text>
        </>
      ) : null}

      {booking.status === 'confirmed' && booking.paymentMethod === 'ecocash' ? (
        <View style={[styles.reconcilePanel, { backgroundColor: colors.surface }]}>
          <Text variant="bodyStrong">Paid in the app.</Text>
          <Text variant="meta" color="neutral700" style={styles.reconcileNote}>
            After the appointment, {firstName} confirms it is done and your payout is released.
          </Text>
        </View>
      ) : null}

      {booking.status === 'confirmed' &&
      booking.paymentMethod === 'cash' &&
      booking.confirmedByProvider ? (
        <View style={[styles.reconcilePanel, { backgroundColor: colors.surface }]}>
          <Text variant="bodyStrong">You confirmed you were paid.</Text>
          <Text variant="meta" color="neutral700" style={styles.reconcileNote}>
            Waiting for {firstName} to confirm the job was done. It closes by itself{' '}
            {completionAutoConfirmHours} hours after your confirmation if they don&apos;t.
          </Text>
        </View>
      ) : null}

      {/* Server-decided: only from the appointment start, for a limited time. */}
      {booking.canReportNonPayment ? (
        <Button
          label={`${firstName} didn't pay`}
          variant="ghost"
          block
          disabled={pending}
          onPress={onReportNonPayment}
        />
      ) : null}
    </Card>
  );
});

/** Falls back to the first two characters when a client has no display name yet — a phone number, usually. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

/**
 * Jobs — the stylist's inbox.
 *
 * Until this existed the provider side of the app did not exist at all: no
 * booking could be accepted, no cash job could be closed, no smart-match
 * offer could be answered outside a dev-only endpoint, and availability could
 * not be switched off.
 */
export default function Jobs() {
  const { colors } = useTheme();
  const { data, isError, error, isLoading, refetch, isRefetching } = useProviderJobs();
  useProviderJobsRealtime();

  const confirmBooking = useConfirmBooking();
  const declineBooking = useDeclineBooking();
  const completeBooking = useProviderConfirmCompletion();
  const reportNonPayment = useReportNonPayment();
  const acceptOffer = useAcceptOffer();
  const declineOffer = useDeclineOffer();
  const setAvailability = useSetAvailability();

  const [actionError, setActionError] = useState<string | null>(null);
  const [showAllCompletedHistory, setShowAllCompletedHistory] = useState(false);
  const [reportTarget, setReportTarget] = useState<ProviderBookingRowDto | null>(null);
  const [reportNote, setReportNote] = useState('');
  const { nonPaymentReportHours } = useAppConfig();

  const busy =
    confirmBooking.isPending ||
    declineBooking.isPending ||
    completeBooking.isPending ||
    reportNonPayment.isPending ||
    acceptOffer.isPending ||
    declineOffer.isPending;

  const onError = useCallback(
    (fallback: string) => (error: unknown) => {
      setActionError(describeError(error, fallback));
    },
    [],
  );

  const acceptOfferMutate = acceptOffer.mutate;
  const declineOfferMutate = declineOffer.mutate;
  const confirmBookingMutate = confirmBooking.mutate;
  const declineBookingMutate = declineBooking.mutate;
  const completeBookingMutate = completeBooking.mutate;

  const actions = useMemo<JobActions>(
    () => ({
      acceptOffer: (id) => {
        setActionError(null);
        acceptOfferMutate(id, {
          onError: onError("Couldn't accept that request — it may have gone."),
        });
      },
      declineOffer: (id) => {
        setActionError(null);
        declineOfferMutate(id, { onError: onError("Couldn't pass on that request.") });
      },
      confirmBooking: (id) => {
        setActionError(null);
        confirmBookingMutate(id, { onError: onError("Couldn't accept that booking.") });
      },
      declineBooking: (id) => {
        setActionError(null);
        declineBookingMutate(id, { onError: onError("Couldn't decline that booking.") });
      },
      completeBooking: (id) => {
        setActionError(null);
        completeBookingMutate(id, { onError: onError("Couldn't confirm that payment.") });
      },
      reportNonPayment: (booking) => {
        setActionError(null);
        setReportNote('');
        setReportTarget(booking);
      },
    }),
    [
      acceptOfferMutate,
      declineOfferMutate,
      confirmBookingMutate,
      declineBookingMutate,
      completeBookingMutate,
      onError,
    ],
  );

  const offers = data?.offers ?? [];
  const bookings = data?.bookings ?? [];
  const requests = bookings.filter((b) => b.status === 'awaiting_provider');
  const upcoming = bookings.filter((b) => b.status === 'confirmed');
  const completed = bookings.filter((b) => b.status === 'completed');
  const visibleCompleted = showAllCompletedHistory
    ? completed
    : completed.slice(0, COMPLETED_HISTORY_PREVIEW_COUNT);

  const sections = useMemo(() => {
    const result: {
      key: JobSection;
      title: string;
      count: number;
      gap: boolean;
      data: JobItem[];
    }[] = [];
    const add = (key: JobSection, title: string, count: number, data: JobItem[]) => {
      if (count === 0) return;
      // Same spacing the stacked layout had: a gap above every group except
      // the first, and always above Completed.
      result.push({ key, title, count, gap: key === 'completed' || result.length > 0, data });
    };
    add(
      'offers',
      'Requests near you',
      offers.length,
      offers.map((offer) => ({ key: `offer:${offer.id}`, kind: 'offer', offer })),
    );
    const bookingItems = (section: 'requests' | 'upcoming' | 'completed', rows: typeof bookings) =>
      rows.map((booking): JobItem => ({
        key: `${section}:${booking.id}`,
        kind: 'booking',
        section,
        booking,
      }));
    add('requests', 'Waiting on you', requests.length, bookingItems('requests', requests));
    add('upcoming', 'Booked in', upcoming.length, bookingItems('upcoming', upcoming));
    add('completed', 'Completed', completed.length, bookingItems('completed', visibleCompleted));
    return result;
    // offers/bookings are derived from `data`; the history toggle changes visibleCompleted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, showAllCompletedHistory]);

  const renderItem = useCallback(
    ({ item }: { item: JobItem }) =>
      item.kind === 'offer' ? (
        <OfferCardRow offer={item.offer} pending={busy} actions={actions} />
      ) : (
        <JobCard
          booking={item.booking}
          section={item.section}
          pending={item.section === 'completed' ? false : busy}
          actions={actions}
        />
      ),
    [busy, actions],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: (typeof sections)[number] }) => (
      <View style={section.gap ? styles.sectionGap : undefined}>
        <SectionLabel label={section.title} count={section.count} />
      </View>
    ),
    [],
  );

  const listHeader = (
    <>
      {actionError ? (
        <Text
          variant="meta"
          color={colors.accent700}
          style={styles.note}
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
        >
          {actionError}
        </Text>
      ) : null}

      {isError && !data ? (
        <ServerConnectionPanel error={error} onRetry={() => void refetch()} />
      ) : isError ? (
        <ServerConnectionPanel error={error} compact onRetry={() => void refetch()} />
      ) : null}

      {data ? (
        <Card bordered style={styles.availabilityCard}>
          <View style={styles.availabilityText}>
            <Text variant="cardTitle">
              {data.acceptingBookings ? 'Taking work' : 'Not taking work'}
            </Text>
            <Text variant="meta" color="neutral700">
              {data.acceptingBookings
                ? 'You appear in Available now and get smart-match requests.'
                : "You're hidden from Available now and won't get new requests."}
            </Text>
          </View>
          <Toggle
            value={data.acceptingBookings}
            accessibilityLabel="Taking work"
            onChange={(next) => {
              // Toggle has no disabled state by design, so a request already
              // in flight is ignored here rather than queueing a second one
              // that would fight the first.
              if (setAvailability.isPending) return;
              setActionError(null);
              setAvailability.mutate(next, {
                onError: onError("Couldn't change your availability. Try again."),
              });
            }}
          />
        </Card>
      ) : null}
    </>
  );

  const listEmpty = (
    <>
      {data && offers.length === 0 && bookings.length === 0 ? (
        <EmptyPanel
          body={
            data.acceptingBookings
              ? 'Nothing yet. Requests from nearby clients will land here.'
              : "You're not taking work, so nothing new will come through."
          }
        />
      ) : null}

      {isLoading && !data ? <EmptyPanel body="Loading your jobs…" /> : null}
    </>
  );

  const listFooter =
    completed.length > COMPLETED_HISTORY_PREVIEW_COUNT ? (
      <Button
        label={
          showAllCompletedHistory ? 'Show less' : `View all history (${String(completed.length)})`
        }
        variant="ghost"
        block
        style={styles.note}
        onPress={() => {
          setShowAllCompletedHistory((current) => !current);
        }}
      />
    ) : null;

  const submitReport = () => {
    if (!reportTarget) return;
    setActionError(null);
    reportNonPayment.mutate(
      {
        id: reportTarget.id,
        input: reportNote.trim() ? { note: reportNote.trim() } : {},
      },
      {
        onSuccess: () => {
          setReportTarget(null);
        },
        onError: (error) => {
          setReportTarget(null);
          setActionError(describeError(error, "Couldn't send that report. Try again."));
        },
      },
    );
  };

  return (
    <>
      <Screen
        hasTabBar
        header={<ScreenHeader title="Jobs" showBack={false} right={<RoleSwitcher />} />}
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
            keyExtractor={(item) => item.key}
            renderItem={renderItem}
            renderSectionHeader={renderSectionHeader}
            stickySectionHeadersEnabled={false}
            ListHeaderComponent={listHeader}
            ListEmptyComponent={listEmpty}
            ListFooterComponent={listFooter}
          />
        )}
      />

      <Sheet
        open={!!reportTarget}
        onClose={() => {
          setReportTarget(null);
        }}
      >
        <Text variant="cardTitle" style={styles.sheetTitle}>
          {reportTarget?.clientName.split(' ')[0]} didn&apos;t pay?
        </Text>
        <Text variant="body" color="neutral700" style={styles.sheetBody}>
          You won&apos;t be charged the service fee for this job. You can report up to{' '}
          {nonPaymentReportHours} hours after the appointment starts. Staff look at clients who are
          reported more than once.
        </Text>
        <TextField
          label="Add a note (optional)"
          value={reportNote}
          onChangeText={setReportNote}
          maxLength={500}
          multiline
          numberOfLines={3}
        />
        <View style={styles.sheetActions}>
          <Button
            label={reportNonPayment.isPending ? 'Sending…' : 'Report non-payment'}
            block
            disabled={reportNonPayment.isPending}
            onPress={submitReport}
          />
          <Button
            label="Cancel"
            variant="ghost"
            block
            onPress={() => {
              setReportTarget(null);
            }}
          />
        </View>
      </Sheet>
    </>
  );
}

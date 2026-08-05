import { useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { User } from 'lucide-react-native';
import {
  BOOKING_STATUS_LABELS,
  formatUsd,
  type ProviderBookingRowDto,
  type ProviderOfferDto,
} from '@sc/shared';
import { color, space } from '@sc/tokens';
import {
  Screen,
  ScreenHeader,
  Text,
  Pressable,
  Avatar,
  Badge,
  Button,
  Card,
  Toggle,
  Countdown,
  SectionLabel,
  EmptyPanel,
} from '@sc/ui';
import {
  useAcceptOffer,
  useConfirmBooking,
  useDeclineBooking,
  useDeclineOffer,
  useProviderConfirmCompletion,
  useProviderJobs,
  useProviderJobsRealtime,
  useSetAvailability,
} from '../../src/api/hooks/useProviderJobs.js';
import { describeError } from '../../src/api/errorMessage.js';

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
  reconcileNote: { marginTop: space.s },
  sectionGap: { marginTop: space.xl },
  profileButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: color.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

/** A live smart-match offer: accept it and it becomes a booking, or it expires. */
function OfferCardRow({
  offer,
  pending,
  onAccept,
  onDecline,
}: {
  offer: ProviderOfferDto;
  pending: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
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
}

function JobCard({
  booking,
  pending,
  onConfirm,
  onDecline,
  onComplete,
}: {
  booking: ProviderBookingRowDto;
  pending: boolean;
  onConfirm: () => void;
  onDecline: () => void;
  onComplete: () => void;
}) {
  return (
    <Card bordered style={styles.card}>
      <View style={styles.headerRow}>
        <Avatar initials={initialsOf(booking.clientName)} tint={color.neutral900} size={44} />
        <View style={styles.middle}>
          <Text variant="cardTitle">{booking.clientName}</Text>
          <Text variant="meta" color="neutral700" style={styles.meta}>
            {booking.serviceName} · {booking.whenLabel}
          </Text>
          <Text variant="metaSmall" color="neutral600">
            {booking.paymentMethod === 'ecocash' ? 'EcoCash' : 'Cash'} ·{' '}
            {formatUsd(booking.priceUsdCents)} · {booking.reference}
          </Text>
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
          <Button label="Mark as done" block disabled={pending} onPress={onComplete} />
          <Text variant="metaSmall" color="neutral600" style={styles.reconcileNote}>
            Cash job — it closes once {booking.clientName.split(' ')[0]} confirms too.
          </Text>
        </>
      ) : null}
    </Card>
  );
}

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
  const { data, isError, isLoading, refetch, isRefetching } = useProviderJobs();
  useProviderJobsRealtime();

  const confirmBooking = useConfirmBooking();
  const declineBooking = useDeclineBooking();
  const completeBooking = useProviderConfirmCompletion();
  const acceptOffer = useAcceptOffer();
  const declineOffer = useDeclineOffer();
  const setAvailability = useSetAvailability();

  const [actionError, setActionError] = useState<string | null>(null);

  const busy =
    confirmBooking.isPending ||
    declineBooking.isPending ||
    completeBooking.isPending ||
    acceptOffer.isPending ||
    declineOffer.isPending;

  const run = (mutate: (id: string) => void, id: string) => {
    setActionError(null);
    mutate(id);
  };

  const onError = (fallback: string) => (error: unknown) => {
    setActionError(describeError(error, fallback));
  };

  const offers = data?.offers ?? [];
  const bookings = data?.bookings ?? [];
  const requests = bookings.filter((b) => b.status === 'awaiting_provider');
  const upcoming = bookings.filter((b) => b.status !== 'awaiting_provider');

  return (
    <Screen
      hasTabBar
      header={
        <ScreenHeader
          title="Jobs"
          showBack={false}
          right={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Profile"
              onPress={() => {
                router.push('/profile');
              }}
              style={styles.profileButton}
            >
              <User size={16} strokeWidth={1.8} color={color.text} />
            </Pressable>
          }
        />
      }
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
      {actionError ? (
        <Text
          variant="meta"
          color={color.accent700}
          style={styles.note}
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
        >
          {actionError}
        </Text>
      ) : null}

      {isError && !data ? (
        <EmptyPanel
          title="Couldn't load your jobs"
          body="Check your connection and pull down to try again."
        />
      ) : isError ? (
        <Text variant="meta" color="neutral700" style={styles.note}>
          Showing your last update — couldn&apos;t reach the server just now.
        </Text>
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

      {offers.length > 0 ? (
        <>
          <SectionLabel label="Requests near you" count={offers.length} />
          {offers.map((offer) => (
            <OfferCardRow
              key={offer.id}
              offer={offer}
              pending={busy}
              onAccept={() => {
                setActionError(null);
                acceptOffer.mutate(offer.id, {
                  onError: onError("Couldn't accept that request — it may have gone."),
                });
              }}
              onDecline={() => {
                setActionError(null);
                declineOffer.mutate(offer.id, {
                  onError: onError("Couldn't pass on that request."),
                });
              }}
            />
          ))}
        </>
      ) : null}

      {requests.length > 0 ? (
        <View style={offers.length > 0 ? styles.sectionGap : undefined}>
          <SectionLabel label="Waiting on you" count={requests.length} />
        </View>
      ) : null}
      {requests.map((booking) => (
        <JobCard
          key={booking.id}
          booking={booking}
          pending={busy}
          onConfirm={() => {
            run(
              (id) =>
                confirmBooking.mutate(id, { onError: onError("Couldn't accept that booking.") }),
              booking.id,
            );
          }}
          onDecline={() => {
            run(
              (id) =>
                declineBooking.mutate(id, { onError: onError("Couldn't decline that booking.") }),
              booking.id,
            );
          }}
          onComplete={() => {
            run(
              (id) =>
                completeBooking.mutate(id, { onError: onError("Couldn't mark that as done.") }),
              booking.id,
            );
          }}
        />
      ))}

      {upcoming.length > 0 ? (
        <View style={requests.length > 0 || offers.length > 0 ? styles.sectionGap : undefined}>
          <SectionLabel label="Booked in" count={upcoming.length} />
        </View>
      ) : null}
      {upcoming.map((booking) => (
        <JobCard
          key={booking.id}
          booking={booking}
          pending={busy}
          onConfirm={() => {
            /* not offered in this state */
          }}
          onDecline={() => {
            /* not offered in this state */
          }}
          onComplete={() => {
            run(
              (id) =>
                completeBooking.mutate(id, { onError: onError("Couldn't mark that as done.") }),
              booking.id,
            );
          }}
        />
      ))}

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
    </Screen>
  );
}

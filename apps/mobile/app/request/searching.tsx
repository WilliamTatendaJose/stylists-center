import { useEffect, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { color, space } from '@sc/tokens';
import { MATCH_REQUEST_TTL_SECONDS } from '@sc/shared';
import {
  Screen,
  Text,
  Pressable,
  ProgressBar,
  RadarPulse,
  Countdown,
  EmptyPanel,
  OfferCard,
  Sheet,
  Button,
  secondsRemaining,
  scOffer,
} from '@sc/ui';
import Animated from 'react-native-reanimated';
import { useCategories } from '../../src/api/hooks/useCategories.js';
import {
  matchQueryKey,
  useCancelMatch,
  useMatch,
  useMatchRealtime,
} from '../../src/api/hooks/useMatching.js';
import { useRequestStore } from '../../src/state/index.js';

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start' },
  headerText: { flex: 1, gap: 3 },
  progressWrap: { marginTop: space.l, marginBottom: space.xl },
  radarBlock: { height: 230, alignItems: 'center', justifyContent: 'center', marginBottom: space.xl },
  countdownOverlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  offersHeading: { marginBottom: space.s },
  offerCard: { marginBottom: space.s },
  footerNote: { marginTop: space.xl, textAlign: 'center' },
  sheetTitle: { marginBottom: space.s },
  sheetBody: { marginBottom: space.xl },
  sheetActions: { gap: space.s },
});

export default function Searching() {
  const queryClient = useQueryClient();
  const { data: categories } = useCategories();
  const categoryId = useRequestStore((s) => s.categoryId);
  const matchId = useRequestStore((s) => s.matchId);
  const reset = useRequestStore((s) => s.reset);

  const { data: match } = useMatch(matchId);
  useMatchRealtime(matchId);
  const cancelMatch = useCancelMatch();

  const expiresAt = match?.expiresAt ?? null;
  const [cancelSheetOpen, setCancelSheetOpen] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(() => (expiresAt ? secondsRemaining(expiresAt) : 0));

  // Cold-start / deep-link guard — this screen only makes sense mid-search.
  useEffect(() => {
    if (!matchId) {
      router.replace('/(tabs)');
    }
  }, [matchId]);

  // The server state is what actually navigates away from this screen — a
  // socket event (or the safety-net refetch in handleExpire below) flips
  // match.state to 'expired', never the client's own clock.
  useEffect(() => {
    if (match?.state === 'expired') {
      router.replace('/request/expired');
    }
  }, [match?.state]);

  // Drives the 1s-linear progress track; the big numeral below has its own
  // 250ms self-contained tick (Countdown) — both derive from the same
  // server-issued expiresAt, so they can never disagree on the truth.
  useEffect(() => {
    if (!expiresAt) return;
    setSecondsLeft(secondsRemaining(expiresAt));
    const interval = setInterval(() => {
      setSecondsLeft(secondsRemaining(expiresAt));
    }, 1000);
    return () => {
      clearInterval(interval);
    };
  }, [expiresAt]);

  const openCancel = () => {
    setCancelSheetOpen(true);
  };

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      openCancel();
      return true;
    });
    return () => {
      sub.remove();
    };
  }, []);

  const confirmCancel = () => {
    setCancelSheetOpen(false);
    if (matchId) cancelMatch.mutate(matchId);
    reset();
    router.replace('/(tabs)');
  };

  // A safety net for a missed 'match.expired' socket event: force a refetch
  // right as the client-side clock hits zero so the state transition still
  // lands (the effect above is what actually navigates).
  const handleExpire = () => {
    if (matchId) void queryClient.invalidateQueries({ queryKey: matchQueryKey(matchId) });
  };

  const viewOffer = (providerId: string) => {
    router.push({
      pathname: '/provider/[id]',
      params: { id: providerId, back: '/request/searching', matchId: matchId ?? '' },
    });
  };

  if (!matchId || !expiresAt) return null;

  const categoryName = categories?.find((c) => c.id === categoryId)?.name ?? 'your service';
  const budget = match?.budget ?? { mode: 'flex' as const };
  const budgetLabel =
    budget.mode === 'fixed' ? `Up to $${String(budget.amountUsd)}` : 'Flexible budget';
  const attempt = match?.attempt ?? 1;
  const offers = match?.offers ?? [];
  const progress = Math.min(1, Math.max(0, secondsLeft / MATCH_REQUEST_TTL_SECONDS));
  const offersHeading =
    offers.length === 0 ? 'Waiting for acceptances' : `${String(offers.length)} stylists accepted`;
  const countdownCaption = offers.length > 0 ? 'left to choose' : 'left to find you someone';

  return (
    <>
      <Screen
        theme="dark"
        header={
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text variant="kicker" color={color.accent400}>
                Attempt {attempt} of 3
              </Text>
              <Text variant="meta" color={color.onDark.body}>
                {categoryName} · {budgetLabel}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel this request"
              onDark
              onPress={openCancel}
            >
              <Text variant="meta" color={color.onDark.text}>
                Cancel
              </Text>
            </Pressable>
          </View>
        }
      >
        <View style={styles.progressWrap}>
          <ProgressBar progress={progress} onDark />
        </View>

        <View style={styles.radarBlock}>
          <RadarPulse size={300} />
          <View style={styles.countdownOverlay}>
            <Countdown
              expiresAt={expiresAt}
              caption={countdownCaption}
              onExpire={handleExpire}
              onDark
            />
          </View>
        </View>

        <Text variant="sectionLabel" color={color.onDark.text} style={styles.offersHeading}>
          {offersHeading}
        </Text>

        {offers.length === 0 ? (
          <EmptyPanel
            onDark
            body="Sent to nearby stylists within your radius. Whoever accepts appears here — you choose. Nobody sees your number until you book."
          />
        ) : (
          offers.map((offer) => (
            <Animated.View key={offer.id} entering={scOffer()} style={styles.offerCard}>
              <OfferCard offer={offer} onView={() => { viewOffer(offer.providerId); }} />
            </Animated.View>
          ))
        )}

        <Text variant="meta" color={color.onDark.meta} style={styles.footerNote}>
          You can close this — we&apos;ll notify you the moment someone accepts.
        </Text>
      </Screen>

      <Sheet
        open={cancelSheetOpen}
        onClose={() => {
          setCancelSheetOpen(false);
        }}
      >
        <Text variant="cardTitle" style={styles.sheetTitle}>
          Cancel this request?
        </Text>
        <Text variant="body" color="neutral700" style={styles.sheetBody}>
          We&apos;ll stop searching. Any stylist who already accepted will be let know it&apos;s no
          longer available.
        </Text>
        <View style={styles.sheetActions}>
          <Button
            label="Keep searching"
            block
            onPress={() => {
              setCancelSheetOpen(false);
            }}
          />
          <Button label="Cancel request" variant="ghost" block onPress={confirmCancel} />
        </View>
      </Sheet>
    </>
  );
}

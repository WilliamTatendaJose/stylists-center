import { useEffect, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
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
import { useRequestStore } from '../../src/state/index.js';
import { MOCK_OFFERS, MOCK_OFFER_DELAYS_MS } from '../../src/fixtures/index.js';

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
  const { data: categories } = useCategories();
  const categoryId = useRequestStore((s) => s.categoryId);
  const budget = useRequestStore((s) => s.budget);
  const attempt = useRequestStore((s) => s.attempt);
  const matchId = useRequestStore((s) => s.matchId);
  const expiresAt = useRequestStore((s) => s.expiresAt);
  const offers = useRequestStore((s) => s.offers);
  const addOffer = useRequestStore((s) => s.addOffer);
  const reset = useRequestStore((s) => s.reset);

  const [cancelSheetOpen, setCancelSheetOpen] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(() => (expiresAt ? secondsRemaining(expiresAt) : 0));

  // Cold-start / deep-link guard — this screen only makes sense mid-search.
  useEffect(() => {
    if (!matchId || !expiresAt) {
      router.replace('/(tabs)');
    }
  }, [matchId, expiresAt]);

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

  // Demo acceptances, per the handoff's t = 2s / 4s / 7s script. Scoped to
  // matchId so a retry (new matchId) re-schedules but re-renders don't.
  useEffect(() => {
    if (!matchId) return;
    const timers = MOCK_OFFERS.map((offer, i) => {
      const delay = MOCK_OFFER_DELAYS_MS[i] ?? 0;
      return setTimeout(() => {
        addOffer(offer);
      }, delay);
    });
    return () => {
      timers.forEach(clearTimeout);
    };
  }, [matchId, addOffer]);

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
    reset();
    router.replace('/(tabs)');
  };

  const handleExpire = () => {
    router.replace('/request/expired');
  };

  const viewOffer = (providerId: string) => {
    router.push({ pathname: '/provider/[id]', params: { id: providerId, back: '/request/searching' } });
  };

  if (!matchId || !expiresAt) return null;

  const categoryName = categories?.find((c) => c.id === categoryId)?.name ?? 'your service';
  const budgetLabel =
    budget.mode === 'fixed' ? `Up to $${String(budget.amountUsd)}` : 'Flexible budget';
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

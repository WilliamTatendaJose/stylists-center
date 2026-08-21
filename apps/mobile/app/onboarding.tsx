import { useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { router } from 'expo-router';
import { CalendarCheck2, MapPin, ShoppingBag } from 'lucide-react-native';
import { Button, Pressable, Screen, Text, useTheme } from '@sc/ui';
import { color, layout, radius, space } from '@sc/tokens';
import { useSessionStore } from '../src/state/useSessionStore.js';

const SLIDES = [
  {
    eyebrow: 'DISCOVER NEARBY',
    title: 'Find your people.',
    body: 'Explore trusted local stylists, compare their work, and discover the right fit for your next look.',
    badge: 'CLOSE TO HOME',
    icon: MapPin,
  },
  {
    eyebrow: 'BOOK WITH CONFIDENCE',
    title: 'Less back-and-forth.',
    body: 'Choose a service, reserve your time, and keep messages and appointment updates together.',
    badge: 'APPOINTMENT SET',
    icon: CalendarCheck2,
  },
  {
    eyebrow: 'ONE BEAUTY CENTRE',
    title: 'More ways to shine.',
    body: 'Shop beauty essentials as a client, or switch roles to grow your own styling business.',
    badge: 'MADE FOR YOU',
    icon: ShoppingBag,
  },
] as const;

const styles = StyleSheet.create({
  screen: { flex: 1, paddingBottom: space.l },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  brandMark: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: color.bg },
  skip: { minHeight: layout.minTouchTarget, justifyContent: 'center', paddingHorizontal: space.s },
  pager: { flex: 1 },
  slide: { flex: 1, justifyContent: 'center', paddingVertical: space.l },
  visual: {
    alignSelf: 'center',
    height: 270,
    borderRadius: radius.hero,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 34,
  },
  glow: {
    position: 'absolute',
    width: 210,
    height: 210,
    borderRadius: 105,
    right: -48,
    top: -58,
    backgroundColor: color.accent,
  },
  ring: {
    position: 'absolute',
    width: 174,
    height: 174,
    borderRadius: 87,
    borderWidth: 1,
    left: -38,
    bottom: -46,
  },
  iconTile: {
    width: 92,
    height: 92,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  badge: {
    position: 'absolute',
    right: space.l,
    bottom: space.l,
    borderRadius: radius.pill,
    paddingVertical: space.s,
    paddingHorizontal: space.m,
  },
  eyebrow: { marginBottom: space.m },
  title: { marginBottom: space.m, maxWidth: 350 },
  body: { maxWidth: 360 },
  footer: { gap: space.l },
  dots: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.s },
  dot: { width: 7, height: 7, borderRadius: 4 },
  activeDot: { width: 24 },
});

export default function Onboarding() {
  const { width } = useWindowDimensions();
  const { colors, isDark } = useTheme();
  const setHasSeenOnboarding = useSessionStore((state) => state.setHasSeenOnboarding);
  const pagerRef = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  const pageWidth = Math.max(1, width - layout.screenX * 2);
  const isLast = page === SLIDES.length - 1;

  const finish = (destination: '/(auth)' | '/(auth)/sign-up') => {
    setHasSeenOnboarding(true);
    router.replace(destination);
  };

  const next = () => {
    if (isLast) {
      finish('/(auth)/sign-up');
      return;
    }
    const nextPage = page + 1;
    pagerRef.current?.scrollTo({ x: nextPage * pageWidth, animated: true });
    setPage(nextPage);
  };

  const updatePage = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextPage = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
    setPage(Math.max(0, Math.min(SLIDES.length - 1, nextPage)));
  };

  return (
    <Screen scroll={false} contentStyle={styles.screen}>
      <View style={styles.topBar}>
        <View style={styles.brandRow}>
          <View style={styles.brandMark}>
            <View style={[styles.brandDot, isDark ? { backgroundColor: colors.bg } : null]} />
          </View>
          <Text variant="wordmark">STYLISTS CENTER</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Skip onboarding"
          onPress={() => finish('/(auth)')}
          style={styles.skip}
        >
          <Text variant="bodyStrong" color="neutral700">
            Skip
          </Text>
        </Pressable>
      </View>

      <ScrollView
        ref={pagerRef}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={updatePage}
        style={styles.pager}
      >
        {SLIDES.map(({ eyebrow, title, body, badge, icon: Icon }) => (
          <View key={title} style={[styles.slide, { width: pageWidth }]}>
            <View
              style={[
                styles.visual,
                {
                  width: pageWidth,
                  backgroundColor: colors.surface,
                  borderColor: colors.divider,
                },
              ]}
            >
              <View style={styles.glow} />
              <View style={[styles.ring, { borderColor: colors.neutral600 }]} />
              <View
                style={[
                  styles.iconTile,
                  { backgroundColor: colors.bg, borderColor: colors.divider },
                ]}
              >
                <Icon size={42} color={colors.accent700} strokeWidth={1.65} />
              </View>
              <View style={[styles.badge, { backgroundColor: colors.neutral900 }]}>
                <Text variant="metaSmall" color={color.onDark.text}>
                  {badge}
                </Text>
              </View>
            </View>
            <Text variant="kicker" color="accent700" style={styles.eyebrow}>
              {eyebrow}
            </Text>
            <Text variant="h2" style={styles.title} accessibilityLiveRegion="polite">
              {title}
            </Text>
            <Text variant="bodyLarge" color="neutral700" style={styles.body}>
              {body}
            </Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.dots} accessibilityLabel={`Page ${String(page + 1)} of 3`}>
          {SLIDES.map((slide, index) => (
            <View
              key={slide.title}
              style={[
                styles.dot,
                index === page ? styles.activeDot : null,
                {
                  backgroundColor: index === page ? colors.accent : colors.neutral600,
                },
              ]}
            />
          ))}
        </View>
        <Button
          label={isLast ? 'Create my account' : 'Next'}
          block
          size="lg"
          arrow
          onPress={next}
        />
      </View>
    </Screen>
  );
}

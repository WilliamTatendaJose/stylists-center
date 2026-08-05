import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Modal, Pressable, StyleSheet, View } from 'react-native';
import { color, radius, space } from '@sc/tokens';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

const ANIMATION_MS = 220;
/** Starting/ending offset for the slide-up, comfortably below any sheet's real height. */
const OFFSCREEN_Y = 400;

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: color.scrim,
  },
  sheet: {
    backgroundColor: color.bg,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: space.xxl,
    paddingTop: space.s,
    paddingBottom: space.l + 20,
  },
  handle: {
    alignSelf: 'center',
    width: 38,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: color.divider,
    marginBottom: space.m,
  },
});

/**
 * The one bottom-sheet system for the role switcher and report-a-problem
 * sheets — full-screen scrim, radius 24 top corners, slide-up entrance.
 *
 * Previously built on @gorhom/bottom-sheet's BottomSheetModal. On this app's
 * React Native 0.86 / reanimated 4 / gesture-handler 3 combination,
 * `ref.current?.present()` silently mounted nothing — no error, no thrown
 * exception, just an `open` state that flipped true while the screen stayed
 * pixel-identical (confirmed byte-for-byte via a UI-tree diff). That is a
 * known class of issue for this library independent of exact versions
 * (gorhom/react-native-bottom-sheet#2020, #1751), and 5.2.14 is already the
 * latest release, so there is no version bump to reach for. Built on RN's
 * own Modal + Animated instead, which has no third-party gesture/reanimated
 * dependency to fall out of sync with.
 */
export function Sheet({ open, onClose, children }: SheetProps) {
  const translateY = useRef(new Animated.Value(OFFSCREEN_Y)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  // The Modal must stay mounted through the close animation — dropping it
  // the instant `open` goes false would cut the slide-down off mid-motion.
  const [visible, setVisible] = useState(open);

  useEffect(() => {
    if (open) {
      setVisible(true);
      Animated.parallel([
        Animated.timing(translateY, { toValue: 0, duration: ANIMATION_MS, useNativeDriver: true }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: ANIMATION_MS,
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    Animated.parallel([
      Animated.timing(translateY, {
        toValue: OFFSCREEN_Y,
        duration: ANIMATION_MS,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, { toValue: 0, duration: ANIMATION_MS, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) setVisible(false);
    });
  }, [open, translateY, backdropOpacity]);

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close"
      >
        <Animated.View style={[styles.scrim, { opacity: backdropOpacity }]} />
        {/* A no-op onPress claims the touch responder for taps inside the
            sheet, which is what stops them from bubbling to the backdrop
            Pressable behind it and closing the sheet on every interaction. */}
        <Pressable onPress={() => undefined}>
          <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
            <View style={styles.handle} />
            {children}
          </Animated.View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

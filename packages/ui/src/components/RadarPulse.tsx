import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { color, motion } from '@sc/tokens';

export interface RadarPulseProps {
  /** Ring diameter in px — 300 on the searching screen, 190 on the provider's incoming-request screen. */
  size?: number;
  rings?: number;
  /** Freezes the animation (app backgrounded) rather than burning battery off-screen. */
  paused?: boolean;
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', borderWidth: 1, borderColor: color.accent, borderRadius: 9999 },
});

function Ring({ size, delay, paused }: { size: number; delay: number; paused: boolean }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (paused) return;
    progress.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, { duration: motion.ping.duration, easing: Easing.out(Easing.ease) }),
        -1,
      ),
    );
  }, [delay, paused, progress]);

  const style = useAnimatedStyle(() => {
    const scale =
      motion.ping.scaleFrom + progress.value * (motion.ping.scaleTo - motion.ping.scaleFrom);
    // The design's opacity curve front-loads the fade (85% -> 6% by 70% of the
    // duration, then to 0) rather than a linear ramp — approximated with an
    // easing curve so most of the ring's life is visible before it vanishes.
    const opacity = motion.ping.opacityFrom * Math.pow(1 - progress.value, 1.6);
    return { transform: [{ scale }], opacity };
  });

  const dimension = { width: size, height: size };

  return <Animated.View style={[styles.ring, dimension, style]} />;
}

/** The radar rings behind the smart-match countdown and a provider's incoming request. */
export function RadarPulse({ size = 300, rings = 3, paused = false }: RadarPulseProps) {
  const boxSize = { width: size, height: size };

  return (
    <View style={[styles.root, boxSize]}>
      {Array.from({ length: rings }, (_, index) => (
        <Ring key={index} size={size} delay={index * motion.ping.stagger} paused={paused} />
      ))}
    </View>
  );
}

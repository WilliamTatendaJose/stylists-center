import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { color, motion } from '@sc/tokens';

export interface LiveDotProps {
  size?: number;
  onDark?: boolean;
}

const styles = StyleSheet.create({
  dot: { borderRadius: 999, backgroundColor: color.accent },
});

/** scBlink — the "live" indicator beside "Available now" and the trip screen's Live pill. */
export function LiveDot({ size = 6 }: LiveDotProps) {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(motion.blink.opacityTo, {
        duration: motion.blink.duration / 2,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true,
    );
  }, [opacity]);

  const dimension = { width: size, height: size };
  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return <Animated.View style={[styles.dot, dimension, animatedStyle]} />;
}

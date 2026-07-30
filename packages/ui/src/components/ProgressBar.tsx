import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { color, motion } from '@sc/tokens';

export interface ProgressBarProps {
  /** 0..1 */
  progress: number;
  height?: number;
  onDark?: boolean;
}

const styles = StyleSheet.create({
  track: { overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: color.accent },
});

/** The smart-match countdown's progress track — width transitions 1s linear, matching the 1s tick it's driven by. */
export function ProgressBar({ progress, height = 2, onDark = false }: ProgressBarProps) {
  const value = useSharedValue(progress);

  useEffect(() => {
    value.value = withTiming(progress, {
      duration: motion.progress.duration,
      easing: Easing.linear,
    });
  }, [progress, value]);

  const trackColor = onDark ? 'rgba(255,255,255,0.15)' : color.divider;
  const trackStyle = { height, backgroundColor: trackColor };
  const fillStyle = useAnimatedStyle(() => ({
    // A template literal interpolating a `number` directly infers the exact
    // `${number}%` type RN's DimensionValue requires; routing it through
    // String() first widens to plain `string` and fails that type check, so
    // the numeric interpolation the lint rule is generally right to flag is
    // the one thing that actually works here.
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    width: `${value.value * 100}%` as const,
  }));

  return (
    <View style={[styles.track, trackStyle]}>
      <Animated.View style={[styles.fill, fillStyle]} />
    </View>
  );
}

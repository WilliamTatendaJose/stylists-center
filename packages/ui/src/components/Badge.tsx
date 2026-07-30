import { StyleSheet, View, type ViewStyle } from 'react-native';
import { color, radius, space } from '@sc/tokens';
import { Text } from '../primitives/Text.js';

export type BadgeTone = 'accent' | 'neutral' | 'accent100';

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  size?: 'sm' | 'md';
}

interface ToneStyle {
  bg: string;
  fg: string;
  border?: string;
}

const TONES: Record<BadgeTone, ToneStyle> = {
  accent: { bg: color.accent, fg: color.bg },
  neutral: { bg: color.neutral200, fg: color.neutral700 },
  // The "ID verified" pill specifically: accent-100 fill, accent-300 border, accent-700 text.
  accent100: { bg: color.accent100, fg: color.accent700, border: color.accent300 },
};

const styles = StyleSheet.create({
  base: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
  },
  sm: { paddingVertical: 4, paddingHorizontal: space.s },
  md: { paddingVertical: space.xs, paddingHorizontal: space.m },
  bordered: { borderWidth: 1 },
});

/** Status badges (Bookings rows) and the "ID verified" trust pill. */
export function Badge({ label, tone = 'neutral', size = 'sm' }: BadgeProps) {
  const t = TONES[tone];
  const fillStyle: ViewStyle = { backgroundColor: t.bg, borderColor: t.border };
  const sizeStyle = size === 'sm' ? styles.sm : styles.md;

  return (
    <View style={[styles.base, sizeStyle, t.border ? styles.bordered : null, fillStyle]}>
      <Text variant={size === 'sm' ? 'statCaption' : 'buttonLabel'} color={t.fg}>
        {label}
      </Text>
    </View>
  );
}

import { StyleSheet, View, type ViewStyle } from 'react-native';
import { radius, space } from '@sc/tokens';
import { Text } from '../primitives/Text.js';
import { useTheme } from '../theme.js';

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
  const { colors } = useTheme();
  const t: ToneStyle = {
    accent: { bg: colors.accent, fg: colors.bg },
    neutral: { bg: colors.neutral200, fg: colors.neutral700 },
    accent100: { bg: colors.accent100, fg: colors.accent700, border: colors.accent300 },
  }[tone];
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

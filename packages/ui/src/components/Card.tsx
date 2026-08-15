import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { radius } from '@sc/tokens';
import { Pressable } from '../primitives/Pressable.js';
import { useTheme } from '../theme.js';

export interface CardProps {
  children: ReactNode;
  bordered?: boolean;
  /** `surface` background fill — cards that sit on top of the page bg get this; cards inside a surface section don't. */
  surface?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.card },
});

/** The radius-20 card container used for the smart-match promo, offer cards, payment method cards, etc. */
export function Card({ children, bordered = false, surface = false, onPress, style }: CardProps) {
  const { colors } = useTheme();
  const composed = [
    styles.base,
    bordered ? { borderWidth: 1, borderColor: colors.divider } : null,
    surface ? { backgroundColor: colors.surface } : null,
    style,
  ];

  if (!onPress) {
    return <View style={composed}>{children}</View>;
  }

  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={composed}>
      {children}
    </Pressable>
  );
}

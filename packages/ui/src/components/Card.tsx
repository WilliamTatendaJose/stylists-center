import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { color, radius } from '@sc/tokens';
import { Pressable } from '../primitives/Pressable.js';

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
  bordered: { borderWidth: 1, borderColor: color.divider },
  surface: { backgroundColor: color.surface },
});

/** The radius-20 card container used for the smart-match promo, offer cards, payment method cards, etc. */
export function Card({ children, bordered = false, surface = false, onPress, style }: CardProps) {
  const composed = [
    styles.base,
    bordered ? styles.bordered : null,
    surface ? styles.surface : null,
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

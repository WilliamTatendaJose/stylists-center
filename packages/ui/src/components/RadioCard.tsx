import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { color, radius, space } from '@sc/tokens';
import { Text } from '../primitives/Text.js';
import { Pressable } from '../primitives/Pressable.js';

export interface RadioCardProps {
  title: string;
  description?: string;
  selected: boolean;
  onPress: () => void;
  /** The circular radio dot (Payment screen). Slot-selection radio-cards (Choose a slot) use accent-fill instead — see `fillWhenSelected`. */
  dot?: boolean;
  /** Choose-a-slot's service cards: selected = solid accent fill + white text, no dot. */
  fillWhenSelected?: boolean;
  right?: ReactNode;
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    gap: space.m,
    alignItems: 'flex-start',
    borderRadius: radius.card,
    borderWidth: 1,
    padding: space.l,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    marginTop: 2,
  },
  dotFillInset: {
    // `inset 0 0 0 3px accent-100` from the handoff — a ring of the tint
    // colour around the solid centre, approximated in RN with a border.
    borderWidth: 3,
  },
  body: { flex: 1 },
  flat: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.tile,
    borderWidth: 1,
    paddingVertical: space.ml,
    paddingHorizontal: space.l,
  },
});

/**
 * Two visual modes sharing one selection contract:
 *  - `dot` (Payment's EcoCash/cash cards): title + description, accent
 *    border + accent-100 fill when selected, a filled radio dot.
 *  - `fillWhenSelected` (Choose a slot's service cards): a flat row, solid
 *    accent fill + white text when selected, no dot.
 */
export function RadioCard({
  title,
  description,
  selected,
  onPress,
  dot = false,
  fillWhenSelected = false,
  right,
}: RadioCardProps) {
  if (fillWhenSelected) {
    const flatStyle: ViewStyle = {
      backgroundColor: selected ? color.accent : color.bg,
      borderColor: selected ? color.accent : color.divider,
    };
    return (
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        accessibilityLabel={title}
        onPress={onPress}
        style={[styles.flat, flatStyle]}
      >
        <Text variant="body" color={selected ? color.bg : color.text} style={styles.body}>
          {title}
        </Text>
        {right}
      </Pressable>
    );
  }

  const cardStyle: ViewStyle = {
    borderColor: selected ? color.accent : color.divider,
    backgroundColor: selected ? color.accent100 : color.bg,
  };
  // Selected: solid accent centre with a lighter accent-100 ring around it
  // (the handoff's `inset 0 0 0 3px accent-100`) — approximated with a 3px
  // border in the ring colour rather than the fill colour, so the ring is
  // actually visible instead of blending into a plain solid circle.
  const dotStyle: ViewStyle = {
    borderColor: selected ? color.accent100 : color.neutral600,
    backgroundColor: selected ? color.accent : 'transparent',
  };

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={title}
      onPress={onPress}
      style={[styles.base, cardStyle]}
    >
      {dot ? <View style={[styles.dot, dotStyle, selected ? styles.dotFillInset : null]} /> : null}
      <View style={styles.body}>
        <Text variant="cardTitle">{title}</Text>
        {description ? (
          <Text variant="meta" color="neutral700">
            {description}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

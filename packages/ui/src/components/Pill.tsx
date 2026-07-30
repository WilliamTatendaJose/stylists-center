import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { ChevronDown } from 'lucide-react-native';
import { color, radius, space } from '@sc/tokens';
import { Text } from '../primitives/Text.js';
import { Pressable } from '../primitives/Pressable.js';

export interface PillProps {
  label: string;
  /** A short accent-coloured trailing note — the map screen's "3 km" beside "Braiding near Avondale". */
  caption?: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: ReactNode;
  /** The role-chip's dropdown chevron. */
  showChevron?: boolean;
  onDark?: boolean;
  style?: StyleProp<ViewStyle>;
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingVertical: space.xs,
    paddingHorizontal: space.ml,
  },
});

/**
 * The small uppercase-caption pill pattern: the role chip (with its dropdown
 * chevron) and the map screen's "{category} near {area}" + "3 km" location
 * pill. NOT the budget/radius selector pills (13px, sentence case, equal-width
 * — that's the separate SegmentedPills component, Tier 2) or the multi-select
 * service chips (accent fill when selected — see Chip, below).
 */
export function Pill({
  label,
  caption,
  selected = false,
  onPress,
  icon,
  showChevron = false,
  onDark = false,
  style,
}: PillProps) {
  const borderColor = selected ? color.accent : onDark ? color.onDark.border : color.divider;
  const textColor = onDark ? color.onDark.text : color.text;
  const containerStyle: ViewStyle = { borderColor };

  const content = (
    <>
      {icon}
      <Text variant="kicker" color={textColor}>
        {label}
      </Text>
      {caption ? (
        <Text variant="kicker" color={color.accent700}>
          {caption}
        </Text>
      ) : null}
      {showChevron ? <ChevronDown size={9} strokeWidth={1.8} color={textColor} /> : null}
    </>
  );

  if (!onPress) {
    return <View style={[styles.base, containerStyle, style]}>{content}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onDark={onDark}
      onPress={onPress}
      style={[styles.base, containerStyle, style]}
    >
      {content}
    </Pressable>
  );
}

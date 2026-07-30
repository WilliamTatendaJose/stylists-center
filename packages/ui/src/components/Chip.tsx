import { StyleSheet, type ViewStyle } from 'react-native';
import { color, radius, space } from '@sc/tokens';
import { Text } from '../primitives/Text.js';
import { Pressable } from '../primitives/Pressable.js';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingVertical: space.xs,
    paddingHorizontal: space.ml,
  },
});

/**
 * The wrapping multi-select chip used for service-category selection (New
 * request's Service section) — selected = accent fill, white text; unselected
 * = divider border, body ink. 13px, sentence case (unlike Pill's uppercase
 * caption pattern).
 */
export function Chip({ label, selected = false, onPress }: ChipProps) {
  const containerStyle: ViewStyle = {
    backgroundColor: selected ? color.accent : 'transparent',
    borderColor: selected ? color.accent : color.divider,
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.base, containerStyle]}
    >
      <Text variant="body" color={selected ? color.bg : color.text}>
        {label}
      </Text>
    </Pressable>
  );
}

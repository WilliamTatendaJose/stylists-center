import { StyleSheet, View, type ViewStyle } from 'react-native';
import { color, radius, space } from '@sc/tokens';
import { Text } from '../primitives/Text.js';
import { Pressable } from '../primitives/Pressable.js';

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: string;
}

export interface SegmentedPillsProps<T extends string | number> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.s },
  pill: {
    flex: 1,
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingVertical: 11,
  },
});

/**
 * Equal-width selectable pills — the budget mode toggle (Flexible / Set an
 * amount) and the search radius ladder (1 / 3 / 8 km). Body-size sentence
 * case, unlike Pill's uppercase caption pattern.
 */
export function SegmentedPills<T extends string | number>({
  options,
  value,
  onChange,
}: SegmentedPillsProps<T>) {
  return (
    <View style={styles.row}>
      {options.map((option) => {
        const selected = option.value === value;
        const pillStyle: ViewStyle = {
          backgroundColor: selected ? color.accent : 'transparent',
          borderColor: selected ? color.accent : color.divider,
        };
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            onPress={() => {
              onChange(option.value);
            }}
            style={[styles.pill, pillStyle]}
          >
            <Text variant="body" color={selected ? color.bg : color.text}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

import { StyleSheet, View, type ViewStyle } from 'react-native';
import { radius, space } from '@sc/tokens';
import { Text } from '../primitives/Text.js';
import { Pressable } from '../primitives/Pressable.js';
import { useTheme } from '../theme.js';

export interface TimeSlotOption {
  time: string;
  available: boolean;
}

export interface TimeGridProps {
  slots: TimeSlotOption[];
  value: string | null;
  onChange: (time: string) => void;
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  pill: {
    // 3 columns with the row's gap.xs (6px) x2 gaps subtracted, matching the
    // handoff's `grid-template-columns: 1fr 1fr 1fr; gap: 6px`.
    flexBasis: '31.5%',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: 11,
  },
  disabled: { opacity: 0.35 },
});

/** The 3-column time-slot grid on Choose a slot — taken slots are visibly disabled, not just dimmed. */
export function TimeGrid({ slots, value, onChange }: TimeGridProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.grid}>
      {slots.map((slot) => {
        const selected = slot.time === value;
        const pillStyle: ViewStyle = {
          backgroundColor: slot.available ? (selected ? colors.accent : colors.bg) : colors.surface,
          borderColor: slot.available
            ? selected
              ? colors.accent
              : colors.divider
            : colors.divider,
        };
        const textColor = !slot.available ? colors.neutral600 : selected ? colors.bg : colors.text;

        return (
          <Pressable
            key={slot.time}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled: !slot.available }}
            accessibilityLabel={slot.available ? slot.time : `${slot.time}, already taken`}
            disabled={!slot.available}
            onPress={() => {
              onChange(slot.time);
            }}
            style={[styles.pill, pillStyle, !slot.available ? styles.disabled : null]}
          >
            <Text variant="body" color={textColor}>
              {slot.time}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

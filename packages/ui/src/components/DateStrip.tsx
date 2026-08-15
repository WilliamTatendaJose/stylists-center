import { StyleSheet, View, type ViewStyle } from 'react-native';
import { radius, space } from '@sc/tokens';
import { Text } from '../primitives/Text.js';
import { Pressable } from '../primitives/Pressable.js';
import { useTheme } from '../theme.js';

export interface DateStripItem {
  /** An opaque key the caller resolves (an ISO date, typically). */
  value: string;
  dow: string;
  day: string;
}

export interface DateStripProps {
  dates: DateStripItem[];
  value: string;
  onChange: (value: string) => void;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.xs },
  card: {
    flex: 1,
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.thumb,
    paddingVertical: 11,
  },
});

/** The 4-card date strip on Choose a slot: uppercase weekday + day number. */
export function DateStrip({ dates, value, onChange }: DateStripProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      {dates.map((d) => {
        const selected = d.value === value;
        const cardStyle: ViewStyle = {
          backgroundColor: selected ? colors.accent : 'transparent',
          borderColor: selected ? colors.accent : colors.divider,
        };
        const ink = selected ? colors.bg : colors.text;
        return (
          <Pressable
            key={d.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={`${d.dow} ${d.day}`}
            onPress={() => {
              onChange(d.value);
            }}
            style={[styles.card, cardStyle]}
          >
            <Text variant="kicker" color={ink}>
              {d.dow}
            </Text>
            <Text variant="numeral" color={ink}>
              {d.day}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

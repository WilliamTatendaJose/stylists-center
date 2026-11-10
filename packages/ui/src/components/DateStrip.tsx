import { ScrollView, StyleSheet, type ViewStyle } from 'react-native';
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
  row: { gap: space.xs },
  card: {
    // A fixed width that fits "WED" and a two-digit day on one line each.
    // With `flex: 1`, a two-week strip squeezed 14 cards into the screen
    // width and broke "TUE" and "10" across two lines.
    width: 60,
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.thumb,
    paddingVertical: 11,
  },
});

/** The date strip on Choose a slot: uppercase weekday + day number, scrolled sideways. */
export function DateStrip({ dates, value, onChange }: DateStripProps) {
  const { colors } = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
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
    </ScrollView>
  );
}

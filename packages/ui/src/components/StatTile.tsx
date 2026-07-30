import { StyleSheet, View } from 'react-native';
import { color, radius, space } from '@sc/tokens';
import { Text } from '../primitives/Text.js';

export interface StatTileProps {
  value: string;
  caption: string;
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    backgroundColor: color.surface,
    borderRadius: radius.tile,
    paddingVertical: space.s,
    paddingHorizontal: space.l,
  },
});

/** The 1/3-grid numeral tiles: Rating/Completed/Years, Distance/Driving/Kombi, ETA/To go/Arrive. */
export function StatTile({ value, caption }: StatTileProps) {
  return (
    <View style={styles.tile}>
      <Text variant="numeral">{value}</Text>
      <Text variant="statCaption" color="neutral600">
        {caption}
      </Text>
    </View>
  );
}

import { StyleSheet } from 'react-native';
import { color, radius, space } from '@sc/tokens';
import { Text } from '../primitives/Text.js';
import { Pressable } from '../primitives/Pressable.js';

export interface CategoryTileProps {
  name: string;
  nearbyCount: number;
  onPress: () => void;
}

const styles = StyleSheet.create({
  tile: {
    backgroundColor: color.surface,
    borderRadius: radius.card,
    padding: space.l,
    minHeight: 74,
    justifyContent: 'space-between',
  },
});

/** The Home screen's 2-column category grid tile — tapping sets the category and opens the request form. */
export function CategoryTile({ name, nearbyCount, onPress }: CategoryTileProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${String(nearbyCount)} nearby`}
      onPress={onPress}
      style={styles.tile}
    >
      <Text variant="cardTitle">{name}</Text>
      <Text variant="statCaption" color="neutral600">
        {nearbyCount} nearby
      </Text>
    </Pressable>
  );
}

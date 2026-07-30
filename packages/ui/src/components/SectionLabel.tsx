import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { space } from '@sc/tokens';
import { Text } from '../primitives/Text.js';

export interface SectionLabelProps {
  label: string;
  count?: number;
  right?: ReactNode;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'baseline', marginBottom: space.s },
  flex: { flex: 1 },
});

/** The h6-style uppercase section header ("Categories", "Available now", "Services") with an optional trailing count/badge. */
export function SectionLabel({ label, count, right }: SectionLabelProps) {
  return (
    <View style={styles.row}>
      <Text variant="sectionLabel" style={styles.flex}>
        {label}
      </Text>
      {count !== undefined ? (
        <Text variant="meta" color="neutral600">
          {count}
        </Text>
      ) : null}
      {right}
    </View>
  );
}

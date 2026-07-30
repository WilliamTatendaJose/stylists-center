import { StyleSheet, View, type ViewStyle } from 'react-native';
import { color, radius, space } from '@sc/tokens';
import { Text } from '../primitives/Text.js';

export interface EmptyPanelProps {
  title?: string;
  body: string;
  onDark?: boolean;
}

const styles = StyleSheet.create({
  panel: {
    borderWidth: 1,
    borderRadius: radius.card,
    padding: space.xl,
  },
});

/** The bordered empty-state panel used on the smart-match searching screen ("Sent to N stylists…") and expired screen. */
export function EmptyPanel({ title, body, onDark = false }: EmptyPanelProps) {
  const borderColor = onDark ? color.onDark.border : color.divider;
  const bodyColor = onDark ? color.onDark.body : color.neutral700;
  const panelStyle: ViewStyle = { borderColor };

  return (
    <View style={[styles.panel, panelStyle]}>
      {title ? (
        <Text variant="sectionLabel" color={onDark ? color.onDark.text : color.text}>
          {title}
        </Text>
      ) : null}
      <Text variant="body" color={bodyColor}>
        {body}
      </Text>
    </View>
  );
}

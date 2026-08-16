import { StyleSheet, View, type ViewStyle } from 'react-native';
import { color, radius, space } from '@sc/tokens';
import { Text } from '../primitives/Text.js';
import { useTheme } from '../theme.js';

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
  const { colors } = useTheme();
  const borderColor = onDark ? color.onDark.border : colors.divider;
  const bodyColor = onDark ? color.onDark.body : colors.neutral700;
  const panelStyle: ViewStyle = { borderColor };

  return (
    <View style={[styles.panel, panelStyle]}>
      {title ? (
        <Text variant="sectionLabel" color={onDark ? color.onDark.text : colors.text}>
          {title}
        </Text>
      ) : null}
      <Text variant="body" color={bodyColor}>
        {body}
      </Text>
    </View>
  );
}

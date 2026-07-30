import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { color } from '@sc/tokens';
import { Text } from '../primitives/Text.js';
import { Pressable } from '../primitives/Pressable.js';

export interface ScreenHeaderProps {
  title?: string;
  subtitle?: ReactNode;
  /** Omit the back chevron entirely — the Booked/Ordered/dark full-screen states have none. */
  showBack?: boolean;
  onBack?: () => void;
  /** Trailing content: "Report", "Step 1/2", the ellipsis menu, etc. */
  right?: ReactNode;
  onDark?: boolean;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  titleFlex: { flex: 1 },
  chevron: { marginLeft: -2 },
});

/**
 * The back-chevron + title + optional trailing-content row used by most
 * non-tab screens (New request, Provider profile, Choose a slot, Payment,
 * Chat, Directions, Trip, Map search's back button, …). Passed into
 * <Screen header={...}>, not a replacement for Screen — it owns none of the
 * safe-area padding itself.
 */
export function ScreenHeader({
  title,
  subtitle,
  showBack = true,
  onBack,
  right,
  onDark = false,
}: ScreenHeaderProps) {
  const ink = onDark ? color.onDark.text : color.text;

  return (
    <View>
      <View style={styles.row}>
        {showBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onDark={onDark}
            onPress={onBack}
            style={styles.chevron}
          >
            <ChevronLeft size={22} strokeWidth={1.9} color={ink} />
          </Pressable>
        ) : null}
        {title ? (
          <Text variant="h4" color={ink} style={styles.titleFlex} numberOfLines={1}>
            {title}
          </Text>
        ) : null}
        {right}
      </View>
      {subtitle}
    </View>
  );
}

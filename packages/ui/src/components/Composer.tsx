import type { ReactNode } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { color, radius, space, type } from '@sc/tokens';
import { Button } from './Button.js';
import { useTheme } from '../theme.js';

export interface ComposerProps {
  value: string;
  onChange: (text: string) => void;
  onSend: () => void;
  disabled?: boolean;
  leading?: ReactNode;
  canSendWithoutText?: boolean;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.s, alignItems: 'center' },
  input: {
    flex: 1,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.divider,
    borderRadius: radius.pill,
    paddingHorizontal: space.ml,
    paddingVertical: 9,
    ...type.body,
    color: color.text,
  },
});

/** The chat composer: pill input + SEND. */
export function Composer({
  value,
  onChange,
  onSend,
  disabled = false,
  leading,
  canSendWithoutText = false,
}: ComposerProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      {leading}
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="Message…"
        placeholderTextColor={colors.neutral600}
        style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.divider, color: colors.text }]}
      />
      <Button
        label="Send"
        onPress={onSend}
        disabled={disabled || (!canSendWithoutText && value.trim().length === 0)}
      />
    </View>
  );
}

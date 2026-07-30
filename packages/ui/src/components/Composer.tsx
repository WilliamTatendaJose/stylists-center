import { StyleSheet, TextInput, View } from 'react-native';
import { color, radius, space, type } from '@sc/tokens';
import { Button } from './Button.js';

export interface ComposerProps {
  value: string;
  onChange: (text: string) => void;
  onSend: () => void;
  disabled?: boolean;
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
export function Composer({ value, onChange, onSend, disabled = false }: ComposerProps) {
  return (
    <View style={styles.row}>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="Message…"
        placeholderTextColor={color.neutral600}
        style={styles.input}
      />
      <Button label="Send" onPress={onSend} disabled={disabled || value.trim().length === 0} />
    </View>
  );
}

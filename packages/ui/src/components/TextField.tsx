import { StyleSheet, TextInput, View, type KeyboardTypeOptions } from 'react-native';
import { color, radius, space, type } from '@sc/tokens';
import { Text } from '../primitives/Text.js';

export interface TextFieldProps {
  value: string;
  onChangeText: (text: string) => void;
  label?: string;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  maxLength?: number;
  autoFocus?: boolean;
  textAlign?: 'left' | 'center';
  editable?: boolean;
}

const styles = StyleSheet.create({
  label: { marginBottom: space.s },
  input: {
    borderWidth: 1,
    borderColor: color.divider,
    borderRadius: radius.tile,
    paddingHorizontal: space.l,
    paddingVertical: 13,
    ...type.bodyLarge,
    color: color.text,
  },
});

/** A bordered free-text field — phone/OTP entry, and any future form (provider onboarding). */
export function TextField({
  value,
  onChangeText,
  label,
  placeholder,
  keyboardType,
  maxLength,
  autoFocus,
  textAlign = 'left',
  editable = true,
}: TextFieldProps) {
  const alignStyle = { textAlign };

  return (
    <View>
      {label ? (
        <Text variant="sectionLabel" color="neutral600" style={styles.label}>
          {label}
        </Text>
      ) : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={color.neutral600}
        keyboardType={keyboardType}
        maxLength={maxLength}
        autoFocus={autoFocus}
        editable={editable}
        style={[styles.input, alignStyle]}
      />
    </View>
  );
}

import { StyleSheet, TextInput, View } from 'react-native';
import { Search } from 'lucide-react-native';
import { color, radius, space, type } from '@sc/tokens';
import { Text } from '../primitives/Text.js';
import { Pressable } from '../primitives/Pressable.js';
import { useTheme } from '../theme.js';

export interface SearchFieldProps {
  value?: string;
  onChangeText?: (text: string) => void;
  placeholder: string;
  /** Home's search row is a button that opens the map, not an editable field — pass this instead of onChangeText. */
  onPress?: () => void;
  /** Fires on the keyboard's return key — for a field backed by a real lookup (e.g. geocoding) rather than live filtering. */
  onSubmitEditing?: () => void;
  returnKeyType?: 'search' | 'done' | 'go' | 'send';
}

const styles = StyleSheet.create({
  base: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.divider,
    borderRadius: radius.pill,
    paddingHorizontal: space.ml,
    paddingVertical: 11,
  },
  input: { flex: 1, padding: 0, ...type.body, color: color.text },
});

/** The pill search row — Home's tap-to-map version (onPress) or a real text field elsewhere. */
export function SearchField({
  value,
  onChangeText,
  placeholder,
  onPress,
  onSubmitEditing,
  returnKeyType,
}: SearchFieldProps) {
  const { colors } = useTheme();
  const baseStyle = [styles.base, { backgroundColor: colors.surface, borderColor: colors.divider }];
  const inputViewStyle = styles.input;
  const inputTextStyle = [styles.input, { color: colors.text }];
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={placeholder}
        onPress={onPress}
        style={baseStyle}
      >
        <Search size={15} strokeWidth={1.7} color={colors.neutral600} />
        <View style={inputViewStyle}>
          <Text variant="body" color="neutral600" numberOfLines={1}>
            {placeholder}
          </Text>
        </View>
      </Pressable>
    );
  }

  return (
    <View style={baseStyle}>
      <Search size={15} strokeWidth={1.7} color={colors.neutral600} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.neutral600}
        style={inputTextStyle}
        onSubmitEditing={onSubmitEditing}
        returnKeyType={returnKeyType}
      />
    </View>
  );
}

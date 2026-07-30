import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { ArrowRight } from 'lucide-react-native';
import { color, radius, space } from '@sc/tokens';
import { Text } from '../primitives/Text.js';
import { Pressable } from '../primitives/Pressable.js';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'outlineOnAccent' | 'whiteOnAccent';
export type ButtonSize = 'md' | 'lg';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Stretches to fill its container's width — `btn-block` in the handoff. */
  block?: boolean;
  loading?: boolean;
  disabled?: boolean;
  /** The trailing chevron-arrow the primary CTA carries throughout the handoff. */
  arrow?: boolean;
  style?: StyleProp<ViewStyle>;
}

interface VariantStyle {
  container: ViewStyle;
  textColor: string;
  onDark: boolean;
}

// accentStrong (not accent700) here: this is a FILLED button, so the accent
// itself is the background, not body-size text on white — the accent700
// contrast rule (tokens.test.ts) governs text colour, not fills.
const VARIANTS: Record<ButtonVariant, VariantStyle> = {
  primary: { container: { backgroundColor: color.accent }, textColor: color.bg, onDark: true },
  secondary: {
    container: { backgroundColor: color.surface, borderWidth: 1, borderColor: color.divider },
    textColor: color.text,
    onDark: false,
  },
  ghost: {
    container: { backgroundColor: 'transparent' },
    textColor: color.neutral700,
    onDark: false,
  },
  outlineOnAccent: {
    container: { backgroundColor: 'transparent', borderWidth: 2, borderColor: color.bg },
    textColor: color.bg,
    onDark: true,
  },
  whiteOnAccent: {
    container: { backgroundColor: color.bg },
    textColor: color.accent700,
    onDark: false,
  },
};

const SIZE_PADDING: Record<ButtonSize, { paddingVertical: number; paddingHorizontal: number }> = {
  md: { paddingVertical: 12, paddingHorizontal: space.xxl },
  lg: { paddingVertical: 13, paddingHorizontal: space.ml },
};

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
  },
  block: { alignSelf: 'stretch' },
  disabled: { opacity: 0.45 },
});

/**
 * Every button in the app — the five variants and the trailing arrow are the
 * handoff's complete button vocabulary (`.btn.btn-primary`, `.btn-secondary`,
 * ghost text links, and the two accent-background variants used on Booked).
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  block = false,
  loading = false,
  disabled = false,
  arrow = false,
  style,
}: ButtonProps) {
  const v = VARIANTS[variant];
  const sizeStyle = SIZE_PADDING[size];
  // With an arrow, the design pushes it to the far edge (`margin-left:auto`
  // on the icon) rather than centering it next to the label — most visible on
  // block/flex:1 buttons like "SEND TO {N} STYLISTS ->". space-between
  // reproduces that; without an arrow the label alone stays centered.
  const containerStyle: ViewStyle = {
    ...v.container,
    ...sizeStyle,
    justifyContent: arrow ? 'space-between' : 'center',
  };
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      onDark={v.onDark}
      disabled={isDisabled}
      onPress={onPress}
      style={[
        styles.base,
        containerStyle,
        block ? styles.block : null,
        isDisabled ? styles.disabled : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.textColor} size="small" />
      ) : (
        <>
          <Text variant={size === 'lg' ? 'buttonLabelLarge' : 'buttonLabel'} color={v.textColor}>
            {label}
          </Text>
          {arrow ? (
            <View pointerEvents="none">
              <ArrowRight size={size === 'lg' ? 15 : 14} strokeWidth={2} color={v.textColor} />
            </View>
          ) : null}
        </>
      )}
    </Pressable>
  );
}

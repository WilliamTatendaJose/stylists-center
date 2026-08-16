import {
  Text as RNText,
  type TextProps as RNTextProps,
  type StyleProp,
  type TextStyle,
} from 'react-native';
import { color, type, type TypeVariant } from '@sc/tokens';
import { useTheme } from '../theme.js';

export interface TextProps extends Omit<RNTextProps, 'style'> {
  /** The type scale variant to render — the only way font size/weight/spacing are set. */
  variant?: TypeVariant;
  /**
   * A token colour name, or a raw colour string for the rare case a screen
   * needs an on-the-fly value (e.g. a per-provider tint). Defaults to
   * `color.text` on light content and is expected to be overridden per
   * dark/accent context by the caller — Text itself has no theme awareness.
   */
  color?: keyof typeof color | (string & {});
  align?: TextStyle['textAlign'];
  style?: StyleProp<TextStyle>;
}

function resolveColor(
  value: TextProps['color'],
  themeColor: { text: string; [key: string]: unknown },
): string {
  if (!value) return themeColor.text;
  if (value in themeColor) {
    const v = themeColor[value as keyof typeof themeColor];
    return typeof v === 'string' ? v : themeColor.text;
  }
  return typeof value === 'string' ? value : themeColor.text;
}

/**
 * The only way text is rendered in this app — every other component and
 * screen must use this instead of react-native's own Text. An ESLint rule
 * (no-restricted-imports on react-native's Text) enforces that outside this
 * file.
 */
export function Text({ variant = 'body', color: colorProp, align, style, ...props }: TextProps) {
  const { colors } = useTheme();
  const colorStyle: TextStyle = { color: resolveColor(colorProp, colors) };
  const alignStyle: TextStyle | undefined = align ? { textAlign: align } : undefined;

  return <RNText {...props} style={[type[variant], colorStyle, alignStyle, style]} />;
}

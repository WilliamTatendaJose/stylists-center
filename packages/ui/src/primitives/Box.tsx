import { View, type ViewProps, type StyleProp, type ViewStyle } from 'react-native';
import { color, radius, type RadiusToken } from '@sc/tokens';
import { resolveSpacing, type SpacingValue } from './spacing.js';

type BorderVariant = 'divider' | 'accent300' | 'accentStrong' | 'onDark';

const BORDER_COLOR: Record<BorderVariant, string> = {
  divider: color.divider,
  accent300: color.accent300,
  accentStrong: color.accent,
  onDark: color.onDark.border,
};

export interface BoxProps extends Omit<ViewProps, 'style'> {
  p?: SpacingValue;
  px?: SpacingValue;
  py?: SpacingValue;
  pt?: SpacingValue;
  pb?: SpacingValue;
  pl?: SpacingValue;
  pr?: SpacingValue;
  m?: SpacingValue;
  mt?: SpacingValue;
  mb?: SpacingValue;
  ml?: SpacingValue;
  mr?: SpacingValue;
  gap?: SpacingValue;
  /** A token colour name, or a raw colour string. */
  bg?: keyof typeof color | (string & {});
  radius?: RadiusToken | number;
  border?: BorderVariant;
  borderWidth?: number;
  /** flexDirection: 'row' shorthand — the design's rows are the common case. */
  row?: boolean;
  /** alignItems + justifyContent: 'center' shorthand. */
  center?: boolean;
  alignItems?: ViewStyle['alignItems'];
  justifyContent?: ViewStyle['justifyContent'];
  flex?: number;
  style?: StyleProp<ViewStyle>;
}

function resolveBg(value: BoxProps['bg']): string | undefined {
  if (!value) return undefined;
  if (value in color) {
    const v = color[value as keyof typeof color];
    return typeof v === 'string' ? v : undefined;
  }
  return value;
}

function resolveRadius(value: BoxProps['radius']): number | undefined {
  if (value === undefined) return undefined;
  return typeof value === 'number' ? value : radius[value];
}

/**
 * The layout primitive everything else in @sc/ui is built from. Spacing props
 * always resolve through the space/radius token scale (see resolveSpacing),
 * so a hand-typed pixel value never sneaks past the no-inline-styles /
 * no-color-literals lint rules that enforce the design system.
 */
export function Box({
  p,
  px,
  py,
  pt,
  pb,
  pl,
  pr,
  m,
  mt,
  mb,
  ml,
  mr,
  gap,
  bg,
  radius: radiusProp,
  border,
  borderWidth = 1,
  row,
  center,
  alignItems,
  justifyContent,
  flex,
  style,
  ...props
}: BoxProps) {
  const computed: ViewStyle = {
    paddingTop: resolveSpacing(pt ?? py ?? p),
    paddingBottom: resolveSpacing(pb ?? py ?? p),
    paddingLeft: resolveSpacing(pl ?? px ?? p),
    paddingRight: resolveSpacing(pr ?? px ?? p),
    marginTop: resolveSpacing(mt ?? m),
    marginBottom: resolveSpacing(mb ?? m),
    marginLeft: resolveSpacing(ml ?? m),
    marginRight: resolveSpacing(mr ?? m),
    gap: resolveSpacing(gap),
    backgroundColor: resolveBg(bg),
    borderRadius: resolveRadius(radiusProp),
    borderWidth: border ? borderWidth : undefined,
    borderColor: border ? BORDER_COLOR[border] : undefined,
    flexDirection: row ? 'row' : undefined,
    alignItems: center ? 'center' : alignItems,
    justifyContent: center ? 'center' : justifyContent,
    flex,
  };

  return <View {...props} style={[computed, style]} />;
}

import { Image, StyleSheet, View, type ViewStyle } from 'react-native';
import { Image as ImageIcon } from 'lucide-react-native';
import { color, type RadiusToken, radius } from '@sc/tokens';
import { Text } from '../primitives/Text.js';

export interface ImagePlaceholderProps {
  /** A real photo URL, once one exists — every call site in M1 omits this (see plan §11 R10: no photography supplied). */
  uri?: string;
  radius?: RadiusToken | number;
  label?: string;
  style?: ViewStyle;
}

const styles = StyleSheet.create({
  base: { overflow: 'hidden' },
  fill: { flex: 1 },
  placeholder: {
    flex: 1,
    backgroundColor: color.neutral200,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
});

function resolveRadius(value: ImagePlaceholderProps['radius']): number {
  if (value === undefined) return radius.thumb;
  return typeof value === 'number' ? value : radius[value];
}

/**
 * Stands in for the design tool's `<image-slot>` everywhere a photo is
 * needed — portfolio, avatars, ID/selfie uploads, product shots. Renders a
 * real image once `uri` is supplied; until then, a neutral tile with an
 * icon and optional caption, matching the handoff's empty state.
 */
export function ImagePlaceholder({ uri, radius: radiusProp, label, style }: ImagePlaceholderProps) {
  const radiusStyle: ViewStyle = { borderRadius: resolveRadius(radiusProp) };

  if (uri) {
    return (
      <View style={[styles.base, radiusStyle, style]}>
        <Image source={{ uri }} style={styles.fill} accessibilityIgnoresInvertColors />
      </View>
    );
  }

  return (
    <View style={[styles.base, radiusStyle, style]}>
      <View style={styles.placeholder}>
        <ImageIcon size={26} strokeWidth={1.6} color={color.neutral600} />
        {label ? (
          <Text variant="metaSmall" color="neutral600" align="center">
            {label}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

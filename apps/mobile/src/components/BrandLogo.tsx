import { Image, type ImageStyle, type StyleProp } from 'react-native';
import { useTheme } from '@sc/ui';
import darkLogoSource from '../../assets/style-center-logo.png';
import lightLogoSource from '../../assets/style-center-logo-light.png';

const LOGO_ASPECT_RATIO = 793 / 368;

export function BrandLogo({
  width = 160,
  style,
}: {
  width?: number;
  style?: StyleProp<ImageStyle>;
}) {
  const { isDark } = useTheme();

  return (
    <Image
      source={isDark ? darkLogoSource : lightLogoSource}
      accessibilityLabel="Style Center — Style. Connect. Grow."
      resizeMode="contain"
      style={[{ width, height: width / LOGO_ASPECT_RATIO }, style]}
    />
  );
}

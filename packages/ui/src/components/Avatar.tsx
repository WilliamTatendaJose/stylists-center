import { Image, StyleSheet, View } from 'react-native';
import { avatarTint, color } from '@sc/tokens';
import { Text } from '../primitives/Text.js';

export interface AvatarProps {
  initials: string;
  /** Round-avatar size in px — the design uses 30/40/44/46/54/78. */
  size: number;
  /** Explicit tint from the record (providers/bookings carry one from the API). Falls back to a stable hash of the initials. */
  tint?: string;
  uri?: string;
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});

/** Round avatar: a real photo when `uri` is supplied, otherwise initials over a tint — matching every list row, profile header, and chat bubble in the handoff. */
export function Avatar({ initials, size, tint, uri }: AvatarProps) {
  const dimension = { width: size, height: size, borderRadius: size / 2 };

  if (uri) {
    return (
      <Image source={{ uri }} style={[styles.circle, dimension]} accessibilityIgnoresInvertColors />
    );
  }

  const fillStyle = { backgroundColor: tint ?? avatarTint(initials) };
  // font size scales roughly with the container, matching the handoff's per-context sizes.
  const textStyle = { fontSize: Math.round(size * 0.33) };

  return (
    <View style={[styles.circle, dimension, fillStyle]}>
      <Text variant="cardTitle" color={color.bg} style={textStyle}>
        {initials}
      </Text>
    </View>
  );
}

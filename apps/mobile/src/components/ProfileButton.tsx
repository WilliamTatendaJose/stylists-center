import { router } from 'expo-router';
import { StyleSheet } from 'react-native';
import { deriveInitials, deriveTint } from '@sc/shared';
import { Avatar, Pressable, useTheme } from '@sc/ui';
import { useMe } from '../api/hooks/useMe.js';
import { apiAssetUrl } from '../api/client.js';

const SIZE = 34;

const styles = StyleSheet.create({
  ring: {
    width: SIZE + 4,
    height: SIZE + 4,
    borderRadius: (SIZE + 4) / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

/**
 * The signed-in user's own avatar in the top bar of every main screen, one
 * tap from their profile. Shows their photo when they have one, otherwise
 * their initials, so it reads as "you" rather than a generic icon.
 */
export function ProfileButton() {
  const { colors } = useTheme();
  const { data: me } = useMe();
  const name = me?.displayName ?? '';
  const uri = apiAssetUrl(me?.avatarImageUrl ?? undefined);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Your profile"
      onPress={() => {
        router.push('/profile');
      }}
      style={[styles.ring, { borderColor: colors.divider }]}
    >
      <Avatar
        initials={name ? deriveInitials(name) : '?'}
        tint={name ? deriveTint(name) : colors.neutral600}
        size={SIZE}
        {...(uri ? { uri } : {})}
      />
    </Pressable>
  );
}

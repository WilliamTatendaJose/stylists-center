import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ChevronRight, LogOut } from 'lucide-react-native';
import { deriveInitials, deriveTint } from '@sc/shared';
import { color, space } from '@sc/tokens';
import { Screen, ScreenHeader, Text, Avatar, Card, Badge, Button, Pressable } from '@sc/ui';
import { useMe } from '../src/api/hooks/useMe.js';
import { useAuthStore } from '../src/state/useAuthStore.js';
import { useBack } from '../src/navigation/useBack.js';

const VERIFICATION_LABEL: Record<'unverified' | 'pending' | 'verified', string> = {
  verified: 'Verified',
  pending: 'Verification pending',
  unverified: 'Not yet verified',
};

const styles = StyleSheet.create({
  identityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    padding: space.l,
    marginBottom: space.xxl,
  },
  identityMiddle: { flex: 1, minWidth: 0 },
  section: { marginBottom: space.xxl },
  sectionLabel: { marginBottom: space.m },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: color.divider,
    borderRadius: 16,
    paddingVertical: space.m,
    paddingHorizontal: space.l,
  },
  rowLeft: { flex: 1, minWidth: 0 },
  rowMeta: { marginTop: 2 },
  signOutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.s,
    paddingVertical: space.m,
  },
});

/**
 * The account screen this app never had a way to reach — sign-out already
 * existed in useAuthStore, wired to nothing. Also the one place that shows
 * whether a client has a stylist page and links to setting one up, instead
 * of that only being discoverable through the role switcher.
 */
export default function Profile() {
  const onBack = useBack('/(tabs)');
  const { data: me } = useMe();
  const signOut = useAuthStore((s) => s.signOut);

  if (!me) return null;

  const initials = deriveInitials(me.displayName);
  const tint = deriveTint(me.displayName);
  const roleLabel = me.activeRole === 'provider' ? 'Provider' : 'Client';

  return (
    <Screen header={<ScreenHeader title="Profile" onBack={onBack} />}>
      <Card bordered style={styles.identityCard}>
        <Avatar initials={initials} tint={tint} size={52} />
        <View style={styles.identityMiddle}>
          <Text variant="cardTitle">{me.displayName}</Text>
          <Text variant="meta" color="neutral700">
            {me.phone}
          </Text>
        </View>
        <Badge label={roleLabel} tone="neutral" />
      </Card>

      <View style={styles.section}>
        <Text variant="sectionLabel" style={styles.sectionLabel}>
          Stylist page
        </Text>
        {me.hasProviderProfile ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Manage my stylist page"
            onPress={() => {
              router.push('/(provider)/jobs');
            }}
            style={styles.row}
          >
            <View style={styles.rowLeft}>
              <Text variant="body">Manage my stylist page</Text>
              <Text variant="meta" color="neutral700" style={styles.rowMeta}>
                {VERIFICATION_LABEL[me.verificationStatus]}
              </Text>
            </View>
            <ChevronRight size={18} strokeWidth={1.8} color={color.neutral700} />
          </Pressable>
        ) : (
          <Button
            label="Set up my stylist page"
            variant="secondary"
            block
            onPress={() => {
              router.push('/provider-setup');
            }}
          />
        )}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Sign out"
        onPress={() => {
          void signOut();
        }}
        style={styles.signOutRow}
      >
        <LogOut size={18} strokeWidth={1.8} color={color.accent700} />
        <Text variant="bodyStrong" color={color.accent700}>
          Sign out
        </Text>
      </Pressable>
    </Screen>
  );
}

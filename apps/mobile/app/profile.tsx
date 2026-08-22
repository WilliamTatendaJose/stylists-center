import { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { router } from 'expo-router';
import {
  CalendarDays,
  ChevronRight,
  LogOut,
  Moon,
  Phone,
  Scissors,
  Sun,
  UserRound,
} from 'lucide-react-native';
import { space } from '@sc/tokens';
import {
  Button,
  Card,
  EmptyPanel,
  Pressable,
  Screen,
  ScreenHeader,
  Sheet,
  Text,
  TextField,
  useTheme,
} from '@sc/ui';
import {
  ProfileHero,
  ProfileIconTile,
  ProfileInfoRow,
  ProfileSection,
} from '../src/components/ProfileChrome.js';
import { useMe, useSetActiveRole, useUpdateProfile } from '../src/api/hooks/useMe.js';
import { describeError } from '../src/api/errorMessage.js';
import { useAuthStore } from '../src/state/useAuthStore.js';
import { useSessionStore } from '../src/state/useSessionStore.js';
import { useBack } from '../src/navigation/useBack.js';
import { PhotoPicker } from '../src/components/PhotoPicker.js';
import { ServerConnectionPanel } from '../src/components/ServerConnectionPanel.js';
import { RoleSwitcher } from '../src/components/RoleSwitcher.js';

const VERIFICATION_LABEL: Record<'unverified' | 'pending' | 'verified', string> = {
  verified: 'Verified professional',
  pending: 'Verification pending',
  unverified: 'Not yet verified',
};

const styles = StyleSheet.create({
  detailsCard: { paddingHorizontal: space.l },
  editButton: { marginTop: space.m },
  bookingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    padding: space.l,
  },
  bookingCopy: { flex: 1, minWidth: 0 },
  bookingMeta: { marginTop: 2 },
  professionalCard: { padding: space.l },
  professionalTop: { flexDirection: 'row', alignItems: 'flex-start', gap: space.m },
  professionalCopy: { flex: 1, minWidth: 0 },
  professionalBody: { marginTop: space.xs },
  professionalStatus: { marginTop: space.l },
  professionalAction: { marginTop: space.l },
  signOutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.s,
    paddingVertical: space.m,
  },
  sheetTitle: { marginBottom: space.s },
  sheetBody: { marginBottom: space.xl },
  sheetField: { marginBottom: space.l },
  sheetError: { marginBottom: space.m },
  photoField: { marginBottom: space.l },
  appearanceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    padding: space.l,
  },
  appearanceCopy: { flex: 1, minWidth: 0 },
});

/** Client identity, account details, bookings shortcut, and professional-mode handoff. */
export default function Profile() {
  const { isDark, colors } = useTheme();
  const onBack = useBack('/(tabs)');
  const { data: me, isLoading, isError, error, refetch } = useMe();
  const updateProfile = useUpdateProfile();
  const setActiveRole = useSetActiveRole();
  const signOut = useAuthStore((state) => state.signOut);
  const themeMode = useSessionStore((state) => state.themeMode);
  const setThemeMode = useSessionStore((state) => state.setThemeMode);
  const followsSystemTheme = themeMode === 'system';
  const isPushed = router.canGoBack();

  const [editOpen, setEditOpen] = useState(false);
  const [name, setName] = useState('');
  const [avatarImageUrl, setAvatarImageUrl] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);

  if (!me) {
    return (
      <Screen
        hasTabBar={!isPushed}
        header={
          <ScreenHeader
            title="My profile"
            showBack={isPushed}
            onBack={onBack}
            right={<RoleSwitcher />}
          />
        }
      >
        {isError ? (
          <ServerConnectionPanel error={error} onRetry={() => void refetch()} />
        ) : (
          <EmptyPanel body={isLoading ? 'Loading your profile…' : 'Nothing to show.'} />
        )}
      </Screen>
    );
  }

  const openEdit = () => {
    setName(me.displayName);
    setAvatarImageUrl(me.avatarImageUrl);
    setEditError(null);
    setEditOpen(true);
  };

  const saveDetails = () => {
    const displayName = name.trim();
    if (displayName.length < 2) return;
    setEditError(null);
    updateProfile.mutate(
      { displayName, avatarImageUrl },
      {
        onSuccess: () => setEditOpen(false),
        onError: (error) => {
          setEditError(describeError(error, "Couldn't save your profile. Try again."));
        },
      },
    );
  };

  const openProfessionalMode = () => {
    if (!me.hasProviderProfile) {
      router.push('/provider-setup');
      return;
    }
    setRoleError(null);
    setActiveRole.mutate('provider', {
      onSuccess: () => router.replace('/(provider)/jobs'),
      onError: (error) => {
        setRoleError(describeError(error, "Couldn't switch to your stylist page."));
      },
    });
  };

  return (
    <>
      <Screen
        hasTabBar={!isPushed}
        header={
          <ScreenHeader
            title="My profile"
            showBack={isPushed}
            onBack={onBack}
            right={<RoleSwitcher />}
          />
        }
      >
        <ProfileHero
          name={me.displayName}
          subtitle={me.email ?? me.phone ?? 'Account'}
          note="This is the name stylists see on your bookings, messages, and reviews."
          roleLabel="Client"
        />

        <ProfileSection label="Personal details">
          <Card bordered style={styles.detailsCard}>
            <ProfileInfoRow
              icon={<UserRound size={20} color={colors.neutral700} />}
              label="Display name"
              value={me.displayName}
            />
            <ProfileInfoRow
              icon={<Phone size={20} color={colors.neutral700} />}
              label="WhatsApp number"
              value={me.phone ?? 'Add a payment phone at checkout'}
              divided
            />
          </Card>
          <Button
            label="Edit personal details"
            variant="secondary"
            block
            style={styles.editButton}
            onPress={openEdit}
          />
        </ProfileSection>

        <ProfileSection label="Your activity">
          <Card bordered onPress={() => router.push('/(tabs)/bookings')} style={styles.bookingCard}>
            <ProfileIconTile>
              <CalendarDays size={20} color={colors.neutral700} />
            </ProfileIconTile>
            <View style={styles.bookingCopy}>
              <Text variant="bodyStrong">Bookings and reviews</Text>
              <Text variant="meta" color="neutral700" style={styles.bookingMeta}>
                Track appointments and review completed services.
              </Text>
            </View>
            <ChevronRight size={20} color={colors.neutral700} />
          </Card>
        </ProfileSection>

        <ProfileSection label="Appearance">
          <Card bordered style={styles.appearanceCard}>
            <ProfileIconTile>
              <Sun size={20} color={isDark ? colors.accent700 : colors.neutral700} />
            </ProfileIconTile>
            <View style={styles.appearanceCopy}>
              <Text variant="bodyStrong">Use device theme</Text>
              <Text variant="meta" color="neutral700">
                Follow your phone's light and dark setting automatically.
              </Text>
            </View>
            <Switch
              accessibilityLabel="Use device theme"
              value={followsSystemTheme}
              onValueChange={(enabled) =>
                setThemeMode(enabled ? 'system' : isDark ? 'dark' : 'light')
              }
              trackColor={{ false: colors.neutral200, true: colors.accent700 }}
              thumbColor={colors.bg}
            />
          </Card>
          <Card bordered style={[styles.appearanceCard, { marginTop: space.m }]}>
            <ProfileIconTile>
              <Moon size={20} color={isDark ? colors.accent700 : colors.neutral700} />
            </ProfileIconTile>
            <View style={styles.appearanceCopy}>
              <Text variant="bodyStrong">Dark mode</Text>
              <Text variant="meta" color="neutral700">
                Override the device setting with a fixed dark appearance.
              </Text>
            </View>
            <Switch
              accessibilityLabel="Dark mode"
              disabled={followsSystemTheme}
              value={isDark}
              onValueChange={(enabled) => setThemeMode(enabled ? 'dark' : 'light')}
              trackColor={{ false: colors.neutral200, true: colors.accent700 }}
              thumbColor={colors.bg}
            />
          </Card>
        </ProfileSection>

        <ProfileSection label="Work on Style Center">
          <Card bordered style={styles.professionalCard}>
            <View style={styles.professionalTop}>
              <ProfileIconTile>
                <Scissors size={20} color={colors.accent700} />
              </ProfileIconTile>
              <View style={styles.professionalCopy}>
                <Text variant="bodyStrong">
                  {me.hasProviderProfile ? 'Your stylist page is ready' : 'Offer your services'}
                </Text>
                <Text variant="meta" color="neutral700" style={styles.professionalBody}>
                  {me.hasProviderProfile
                    ? 'Switch modes to manage jobs, services, photos, and earnings.'
                    : 'Create a public page, add services, and start taking bookings.'}
                </Text>
              </View>
            </View>
            {me.hasProviderProfile ? (
              <Text variant="metaSmall" color="neutral600" style={styles.professionalStatus}>
                {VERIFICATION_LABEL[me.verificationStatus]}
              </Text>
            ) : null}
            {roleError ? (
              <Text variant="meta" color={colors.accent700} style={styles.professionalStatus}>
                {roleError}
              </Text>
            ) : null}
            {me.verificationStatus !== 'verified' ? (
              <Button
                label={
                  me.verificationStatus === 'pending' ? 'Review verification' : 'Verify identity'
                }
                variant="secondary"
                block
                style={styles.professionalAction}
                onPress={() => router.push('/verify')}
              />
            ) : null}
            <Button
              label={
                setActiveRole.isPending
                  ? 'Switching…'
                  : me.hasProviderProfile
                    ? 'Switch to stylist view'
                    : 'Set up my stylist page'
              }
              block
              disabled={setActiveRole.isPending}
              style={styles.professionalAction}
              onPress={openProfessionalMode}
            />
          </Card>
        </ProfileSection>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          onPress={() => void signOut()}
          style={styles.signOutRow}
        >
          <LogOut size={18} strokeWidth={1.8} color={colors.accent700} />
          <Text variant="bodyStrong" color={colors.accent700}>
            Sign out
          </Text>
        </Pressable>
      </Screen>

      <Sheet open={editOpen} onClose={() => setEditOpen(false)}>
        <Text variant="cardTitle" style={styles.sheetTitle}>
          Edit personal details
        </Text>
        <Text variant="body" color="neutral700" style={styles.sheetBody}>
          Your display name is public on bookings, chats, and reviews. Your WhatsApp number stays
          tied to login.
        </Text>
        {editError ? (
          <Text
            variant="meta"
            color={colors.accent700}
            style={styles.sheetError}
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
          >
            {editError}
          </Text>
        ) : null}
        <View style={styles.sheetField}>
          <TextField
            label="Display name"
            value={name}
            onChangeText={setName}
            maxLength={60}
            autoFocus
          />
        </View>
        <View style={styles.photoField}>
          <PhotoPicker
            label="Profile photo"
            urls={avatarImageUrl ? [avatarImageUrl] : []}
            maxPhotos={1}
            uploadEndpoint="/v1/me/images"
            helpText="Shown to stylists on your jobs and in messages."
            disabled={updateProfile.isPending}
            onChange={(urls) => setAvatarImageUrl(urls[0] ?? null)}
            onError={(message) => setEditError(message || null)}
          />
        </View>
        <Button
          label={updateProfile.isPending ? 'Saving…' : 'Save changes'}
          block
          disabled={name.trim().length < 2 || updateProfile.isPending}
          onPress={saveDetails}
        />
      </Sheet>
    </>
  );
}

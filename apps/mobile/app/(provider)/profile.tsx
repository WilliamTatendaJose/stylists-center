import { useEffect, useState } from 'react';
import { Share, StyleSheet, Switch, View } from 'react-native';
import { router } from 'expo-router';
import { Clock3, Gift, LogOut, MapPin, Moon, Sun, UserRound } from 'lucide-react-native';
import { deriveInitials, formatInHarare, formatUsd, type ServiceDto } from '@sc/shared';
import { space } from '@sc/tokens';
import {
  Badge,
  Button,
  Card,
  EmptyPanel,
  ListRow,
  Pressable,
  Screen,
  ScreenHeader,
  Sheet,
  Text,
  TextField,
  useTheme,
} from '@sc/ui';
import {
  useAddProviderService,
  useProviderManagementProfile,
  useProviderSubscription,
  useUpdateProviderProfile,
  useUpdateProviderService,
} from '../../src/api/hooks/useProviders.js';
import { useMe, useSetActiveRole } from '../../src/api/hooks/useMe.js';
import { describeError } from '../../src/api/errorMessage.js';
import { useAuthStore } from '../../src/state/useAuthStore.js';
import {
  useSessionStore,
  usePendingSubscriptionStore,
  useLocationPickerStore,
} from '../../src/state/index.js';
import { PhotoPicker } from '../../src/components/PhotoPicker.js';
import { apiAssetUrl } from '../../src/api/client.js';
import { RoleSwitcher } from '../../src/components/RoleSwitcher.js';
import { providerShareLink } from '../../src/sharing/shareLinks.js';
import {
  ProfileHero,
  ProfileIconTile,
  ProfileInfoRow,
  ProfileSection,
} from '../../src/components/ProfileChrome.js';

const styles = StyleSheet.create({
  error: { marginBottom: space.m },
  contentCard: { padding: space.l },
  detailsCard: { paddingHorizontal: space.l },
  cardAction: { marginTop: space.l },
  accountGap: { marginTop: space.s },
  subscriptionTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  grow: { flex: 1, minWidth: 0 },
  subscriptionMeta: { marginTop: 2 },
  photoHelp: { marginTop: space.s },
  roleTop: { flexDirection: 'row', alignItems: 'flex-start', gap: space.m },
  roleCopy: { flex: 1, minWidth: 0 },
  roleBody: { marginTop: space.xs },
  signOutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.s,
    paddingVertical: space.m,
    marginTop: space.m,
  },
  sheetTitle: { marginBottom: space.s },
  sheetBody: { marginBottom: space.xl },
  sheetField: { marginBottom: space.m },
  sheetError: { marginBottom: space.m },
  appearanceCard: { flexDirection: 'row', alignItems: 'center', gap: space.m, padding: space.l },
  rewardsShortcut: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    padding: space.l,
    marginTop: space.l,
    borderWidth: 1,
  },
  rewardsShortcutCopy: { flex: 1, minWidth: 0 },
  rewardsShortcutHint: { marginTop: 2 },
  appearanceCopy: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: space.m },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s,
    marginTop: space.s,
    marginBottom: space.m,
  },
});

export default function ProviderProfile() {
  const { colors, isDark } = useTheme();
  const { data, isError, refetch } = useProviderManagementProfile();
  const { data: me } = useMe();
  const updateProfile = useUpdateProviderProfile();
  const addService = useAddProviderService();
  const updateService = useUpdateProviderService();
  const { data: subscription } = useProviderSubscription();
  const pendingSubscription = usePendingSubscriptionStore((s) => s.pending);
  const subPaymentPending = pendingSubscription !== null;
  const setActiveRole = useSetActiveRole();
  const deviceLocation = useSessionStore((state) => state.location);
  const locationSource = useSessionStore((state) => state.locationSource);
  const pickedLocation = useLocationPickerStore((s) => s.result);
  const clearPickedLocation = useLocationPickerStore((s) => s.clearResult);
  const themeMode = useSessionStore((state) => state.themeMode);
  const setThemeMode = useSessionStore((state) => state.setThemeMode);
  const followsSystemTheme = themeMode === 'system';
  const signOut = useAuthStore((state) => state.signOut);

  const [displayName, setDisplayName] = useState('');
  const [areaName, setAreaName] = useState('');
  const [workingHoursLabel, setWorkingHoursLabel] = useState('');
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);
  const [portfolioImageUrls, setPortfolioImageUrls] = useState<string[]>([]);
  const [lat, setLat] = useState(0);
  const [lng, setLng] = useState(0);
  const [serviceName, setServiceName] = useState('');
  const [duration, setDuration] = useState('60');
  const [price, setPrice] = useState('20');
  const [serviceImageUrls, setServiceImageUrls] = useState<string[]>([]);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detailsSheetOpen, setDetailsSheetOpen] = useState(false);
  const [serviceSheetOpen, setServiceSheetOpen] = useState(false);

  useEffect(() => {
    if (!data) return;
    setDisplayName(data.displayName);
    setAreaName(data.areaName);
    setWorkingHoursLabel(data.workingHoursLabel);
    setProfileImageUrl(data.profileImageUrl ?? null);
    setPortfolioImageUrls(data.portfolioImageUrls);
    setLat(data.lat);
    setLng(data.lng);
  }, [data]);

  // Consumed once, right after the map picker pops back to this screen (still
  // mounted underneath it) — see useLocationPickerStore for why this goes
  // through a store rather than route params.
  useEffect(() => {
    if (!pickedLocation) return;
    setLat(pickedLocation.lat);
    setLng(pickedLocation.lng);
    if (pickedLocation.areaName) setAreaName(pickedLocation.areaName);
    clearPickedLocation();
  }, [pickedLocation, clearPickedLocation]);

  if (isError && !data) {
    return (
      <Screen
        hasTabBar
        header={<ScreenHeader title="My page" showBack={false} right={<RoleSwitcher />} />}
      >
        <EmptyPanel title="Couldn't load your page" body="Check your connection and try again." />
        <Button label="Try again" onPress={() => void refetch()} />
      </Screen>
    );
  }

  const profileInput = (nextImages = portfolioImageUrls, nextProfileImage = profileImageUrl) => ({
    displayName: displayName.trim(),
    areaName: areaName.trim(),
    workingHoursLabel: workingHoursLabel.trim(),
    lat,
    lng,
    profileImageUrl: nextProfileImage,
    portfolioImageUrls: nextImages,
  });

  const saveDetails = () => {
    setError(null);
    updateProfile.mutate(profileInput(), {
      onSuccess: () => setDetailsSheetOpen(false),
      onError: (reason) => setError(describeError(reason, "Couldn't save your page.")),
    });
  };

  const savePhotos = (nextImages: string[]) => {
    const previousImages = portfolioImageUrls;
    setPortfolioImageUrls(nextImages);
    setError(null);
    updateProfile.mutate(profileInput(nextImages), {
      onError: (reason) => {
        setPortfolioImageUrls(previousImages);
        setError(describeError(reason, "Couldn't save those photos."));
      },
    });
  };

  const saveProfilePhoto = (nextImages: string[]) => {
    const previousImage = profileImageUrl;
    const nextImage = nextImages[0] ?? null;
    setProfileImageUrl(nextImage);
    setError(null);
    updateProfile.mutate(profileInput(portfolioImageUrls, nextImage), {
      onError: (reason) => {
        setProfileImageUrl(previousImage);
        setError(describeError(reason, "Couldn't save your public page photo."));
      },
    });
  };

  const openNewService = () => {
    setEditingServiceId(null);
    setServiceName('');
    setDuration('60');
    setPrice('20');
    setServiceImageUrls([]);
    setError(null);
    setServiceSheetOpen(true);
  };

  const openService = (service: ServiceDto) => {
    setEditingServiceId(service.id);
    setServiceName(service.name);
    setDuration(String(service.durationMinutes));
    setPrice((service.priceUsdCents / 100).toFixed(2));
    setServiceImageUrls(service.imageUrls ?? []);
    setError(null);
    setServiceSheetOpen(true);
  };

  const saveService = () => {
    setError(null);
    const input = {
      name: serviceName.trim(),
      durationMinutes: Number(duration),
      priceUsdCents: Math.round(Number(price) * 100),
      imageUrls: serviceImageUrls,
    };
    const options = {
      onSuccess: () => {
        setEditingServiceId(null);
        setServiceName('');
        setDuration('60');
        setPrice('20');
        setServiceImageUrls([]);
        setServiceSheetOpen(false);
      },
      onError: (reason: Error) => setError(describeError(reason, "Couldn't save that service.")),
    };
    if (editingServiceId) {
      updateService.mutate({ id: editingServiceId, input }, options);
    } else {
      addService.mutate(input, options);
    }
  };

  const shareProfile = () => {
    if (!data) return;
    void Share.share({
      message: `Check out ${data.displayName} on Style Center!\n${providerShareLink(data.id)}`,
    });
  };

  const switchToClient = () => {
    setError(null);
    setActiveRole.mutate('client', {
      onSuccess: () => router.replace('/(tabs)'),
      onError: (reason) => setError(describeError(reason, "Couldn't switch roles. Try again.")),
    });
  };

  const profileValid =
    displayName.trim().length >= 2 &&
    areaName.trim().length >= 2 &&
    workingHoursLabel.trim().length >= 2;
  const serviceValid =
    serviceName.trim().length >= 2 && Number(duration) >= 10 && Number(price) >= 1;
  const serviceSaving = addService.isPending || updateService.isPending;

  return (
    <>
      <Screen
        hasTabBar
        header={<ScreenHeader title="My page" showBack={false} right={<RoleSwitcher />} />}
      >
        {error ? (
          <Text
            variant="meta"
            color={colors.accent700}
            style={styles.error}
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
          >
            {error}
          </Text>
        ) : null}

        <ProfileHero
          name={displayName || 'Your name'}
          subtitle={areaName || 'Your area'}
          note={
            workingHoursLabel
              ? `Available ${workingHoursLabel}`
              : 'Add your working hours so clients know when to book.'
          }
          roleLabel="Stylist"
          imageUrl={apiAssetUrl(profileImageUrl ?? portfolioImageUrls[0])}
        />

        <ProfileSection label="Identity and rewards">
          <Card bordered style={styles.contentCard}>
            <Text variant="bodyStrong">
              {me?.verificationStatus === 'verified'
                ? 'Identity verified'
                : me?.verificationStatus === 'pending'
                  ? 'Verification in review'
                  : 'Verify to build trust'}
            </Text>
            <Text variant="meta" color="neutral700" style={styles.roleBody}>
              {me?.verificationStatus === 'verified'
                ? 'Your identity badge and agent rewards are unlocked. The uploaded documents were deleted after review.'
                : 'Submit an ID and selfie for review. We delete the uploads after a decision and do not store your identity documents.'}
            </Text>
            {me?.verificationStatus !== 'verified' ? (
              <Button
                label={
                  me?.verificationStatus === 'pending' ? 'Review submission' : 'Verify identity'
                }
                variant="secondary"
                block
                style={styles.cardAction}
                onPress={() => router.push('/verify')}
              />
            ) : null}
            <Card
              bordered
              onPress={() => router.push('./rewards')}
              style={[
                styles.rewardsShortcut,
                { backgroundColor: colors.accent100, borderColor: colors.accent700 },
              ]}
            >
              <Gift size={22} color={colors.accent700} strokeWidth={1.9} />
              <View style={styles.rewardsShortcutCopy}>
                <Text variant="bodyStrong" color={colors.accent700}>
                  Rewards wallet
                </Text>
                <Text
                  variant="metaSmall"
                  color={colors.accent700}
                  style={styles.rewardsShortcutHint}
                >
                  View invites, SC Coins, and cash-out activity
                </Text>
              </View>
            </Card>
          </Card>
        </ProfileSection>

        <ProfileSection label="Public page">
          <Card bordered style={styles.detailsCard}>
            <View style={styles.cardAction}>
              <PhotoPicker
                label="Public page photo"
                urls={profileImageUrl ? [profileImageUrl] : []}
                maxPhotos={1}
                helpText="Shown beside your name in search, bookings, and on your public page."
                disabled={updateProfile.isPending}
                onChange={saveProfilePhoto}
                onError={(message) => setError(message || null)}
              />
            </View>
            <ProfileInfoRow
              icon={<MapPin size={20} color={colors.neutral700} />}
              label="Service area"
              value={areaName || 'Not set'}
            />
            <ProfileInfoRow
              icon={<Clock3 size={20} color={colors.neutral700} />}
              label="Working hours"
              value={workingHoursLabel || 'Not set'}
              divided
            />
            <Button
              label="Edit public details"
              variant="secondary"
              block
              onPress={() => {
                setError(null);
                setDetailsSheetOpen(true);
              }}
            />
            {data ? (
              <View style={[styles.row, styles.accountGap]}>
                <View style={styles.grow}>
                  <Button label="Share my page" variant="ghost" block onPress={shareProfile} />
                </View>
                <View style={styles.grow}>
                  <Button
                    label="View as a client"
                    variant="ghost"
                    block
                    onPress={() =>
                      router.push({
                        pathname: '/provider/[id]',
                        params: { id: data.id, back: '/(provider)/profile' },
                      })
                    }
                  />
                </View>
              </View>
            ) : null}
          </Card>
        </ProfileSection>

        <ProfileSection label="Portfolio">
          <Card bordered style={styles.contentCard}>
            <PhotoPicker
              label="Your work"
              urls={portfolioImageUrls}
              disabled={updateProfile.isPending}
              onChange={savePhotos}
              onError={(message) => setError(message || null)}
            />
            <Text variant="metaSmall" color="neutral600" style={styles.photoHelp}>
              Work photos save automatically and appear in your public portfolio.
            </Text>
          </Card>
        </ProfileSection>

        <ProfileSection label="Services" count={data?.services.length}>
          {data?.services.length === 0 ? (
            <EmptyPanel body="Add a service so clients can see your price and book you." />
          ) : (
            data?.services.map((service) => (
              <ListRow
                key={service.id}
                avatar={{
                  initials: deriveInitials(service.name),
                  uri: apiAssetUrl(service.imageUrls?.[0]),
                  size: 44,
                }}
                title={service.name}
                meta={`${service.durationMinutes} min`}
                subMeta="Tap to edit details and photos"
                rightPrimary={formatUsd(service.priceUsdCents)}
                onPress={() => openService(service)}
              />
            ))
          )}
          <Button
            label="Add a service"
            variant="secondary"
            block
            style={styles.cardAction}
            onPress={openNewService}
          />
        </ProfileSection>

        {subscription ? (
          <ProfileSection label="Plan and visibility">
            <Card bordered style={styles.contentCard}>
              <View style={styles.subscriptionTop}>
                <View style={styles.grow}>
                  <Text variant="cardTitle">Subscription</Text>
                  <Text variant="meta" color="neutral700" style={styles.subscriptionMeta}>
                    {formatUsd(subscription.priceUsdCents)} / month
                  </Text>
                  {subscription.paidUntil ? (
                    <Text variant="metaSmall" color="neutral600" style={styles.subscriptionMeta}>
                      {subscription.active ? 'Renews' : 'Expired'}{' '}
                      {formatInHarare(subscription.paidUntil, 'd MMM yyyy')}
                    </Text>
                  ) : null}
                </View>
                <Badge
                  label={
                    subPaymentPending
                      ? 'Payment pending'
                      : subscription.active
                        ? 'Active'
                        : 'Past due'
                  }
                  tone={subscription.active && !subPaymentPending ? 'accent100' : 'accent'}
                />
              </View>
              {!subscription.active && !subPaymentPending ? (
                <Text variant="meta" color="neutral700" style={styles.subscriptionMeta}>
                  Pay to appear in search and smart-match.
                </Text>
              ) : null}
              <Button
                label={
                  subPaymentPending
                    ? 'Continue payment'
                    : subscription.active
                      ? 'Renew early'
                      : `Pay ${formatUsd(subscription.priceUsdCents)}`
                }
                variant={subscription.active ? 'secondary' : 'primary'}
                block
                style={styles.cardAction}
                onPress={() => {
                  router.push(subPaymentPending ? '/subscription/paying' : '/subscription/payment');
                }}
              />
            </Card>
          </ProfileSection>
        ) : null}

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

        <ProfileSection label="Account">
          <Card bordered style={styles.contentCard}>
            <View style={styles.roleTop}>
              <ProfileIconTile>
                <UserRound size={20} color={colors.neutral700} />
              </ProfileIconTile>
              <View style={styles.roleCopy}>
                <Text variant="bodyStrong">Client view</Text>
                <Text variant="meta" color="neutral700" style={styles.roleBody}>
                  Browse stylists, shop the market, and manage your own bookings.
                </Text>
              </View>
            </View>
            <Button
              label={setActiveRole.isPending ? 'Switching…' : 'Switch to client view'}
              block
              style={styles.cardAction}
              disabled={setActiveRole.isPending}
              onPress={switchToClient}
            />
          </Card>
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
        </ProfileSection>
      </Screen>

      <Sheet open={detailsSheetOpen} onClose={() => setDetailsSheetOpen(false)}>
        <Text variant="cardTitle" style={styles.sheetTitle}>
          Edit public details
        </Text>
        <Text variant="body" color="neutral700" style={styles.sheetBody}>
          Keep this clear and current so clients know where and when you work.
        </Text>
        {error ? (
          <Text variant="meta" color={colors.accent700} style={styles.sheetError}>
            {error}
          </Text>
        ) : null}
        <View style={styles.sheetField}>
          <TextField label="Provider name" value={displayName} onChangeText={setDisplayName} />
        </View>
        <View style={styles.sheetField}>
          <TextField label="Area" value={areaName} onChangeText={setAreaName} />
        </View>
        <View style={styles.sheetField}>
          <TextField
            label="Working hours"
            value={workingHoursLabel}
            onChangeText={setWorkingHoursLabel}
          />
        </View>
        <View style={styles.row}>
          <View style={styles.grow}>
            <Button
              label="Choose on map"
              variant="secondary"
              block
              onPress={() => {
                router.push({
                  pathname: '/map/pick-location',
                  params: { lat: String(lat), lng: String(lng) },
                });
              }}
            />
          </View>
          <View style={styles.grow}>
            <Button
              label={locationSource === 'device' ? 'Use current location' : 'Location unavailable'}
              variant="secondary"
              block
              disabled={locationSource !== 'device'}
              onPress={() => {
                setLat(deviceLocation.lat);
                setLng(deviceLocation.lng);
              }}
            />
          </View>
        </View>
        <View style={styles.locationRow}>
          <MapPin size={16} color={colors.neutral700} />
          <Text variant="meta" color="neutral700">
            {lat.toFixed(5)}, {lng.toFixed(5)}
          </Text>
        </View>
        <Button
          label={updateProfile.isPending ? 'Saving…' : 'Save changes'}
          block
          disabled={!profileValid || updateProfile.isPending}
          onPress={saveDetails}
        />
      </Sheet>

      <Sheet open={serviceSheetOpen} onClose={() => setServiceSheetOpen(false)}>
        <Text variant="cardTitle" style={styles.sheetTitle}>
          {editingServiceId ? 'Edit service' : 'Add a service'}
        </Text>
        <Text variant="body" color="neutral700" style={styles.sheetBody}>
          Give clients a clear service name, duration, price, and examples of the result.
        </Text>
        {error ? (
          <Text variant="meta" color={colors.accent700} style={styles.sheetError}>
            {error}
          </Text>
        ) : null}
        <View style={styles.sheetField}>
          <TextField
            label="Service name"
            value={serviceName}
            onChangeText={setServiceName}
            placeholder="e.g. Knotless braids"
            autoFocus
          />
        </View>
        <View style={styles.row}>
          <View style={styles.grow}>
            <TextField
              label="Minutes"
              value={duration}
              onChangeText={setDuration}
              keyboardType="number-pad"
            />
          </View>
          <View style={styles.grow}>
            <TextField
              label="Price (USD)"
              value={price}
              onChangeText={setPrice}
              keyboardType="decimal-pad"
            />
          </View>
        </View>
        <View style={styles.cardAction}>
          <PhotoPicker
            label="Service photos"
            urls={serviceImageUrls}
            disabled={serviceSaving}
            onChange={setServiceImageUrls}
            onError={(message) => setError(message || null)}
          />
        </View>
        <Button
          label={serviceSaving ? 'Saving…' : editingServiceId ? 'Save service' : 'Add service'}
          block
          style={styles.cardAction}
          disabled={!serviceValid || serviceSaving}
          onPress={saveService}
        />
      </Sheet>
    </>
  );
}

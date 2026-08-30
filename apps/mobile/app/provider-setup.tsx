import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { CheckCircle2 } from 'lucide-react-native';
import { color, space } from '@sc/tokens';
import {
  Screen,
  ScreenHeader,
  Text,
  Chip,
  TextField,
  RangeInput,
  Button,
  Pressable,
  useTheme,
} from '@sc/ui';
import { useCategories } from '../src/api/hooks/useCategories.js';
import { useCreateProviderProfile } from '../src/api/hooks/useProviders.js';
import { useMe } from '../src/api/hooks/useMe.js';
import { useClaimReferral } from '../src/api/hooks/useWallet.js';
import { useInviteStore, useLocationPickerStore, useSessionStore } from '../src/state/index.js';
import { describeError } from '../src/api/errorMessage.js';
import { useBack } from '../src/navigation/useBack.js';
import { useAddressAutocomplete } from '../src/location/useAddressAutocomplete.js';

const MIN_YEARS = 0;
const MAX_YEARS = 30;
const DEFAULT_YEARS = 1;

const MIN_DURATION_MINUTES = 15;
const MAX_DURATION_MINUTES = 240;
const DURATION_STEP_MINUTES = 15;
const DEFAULT_DURATION_MINUTES = 60;

const MIN_PRICE_USD = 5;
const MAX_PRICE_USD = 200;
const PRICE_STEP_USD = 5;
const DEFAULT_PRICE_USD = 20;

const styles = StyleSheet.create({
  intro: { marginBottom: space.xxl },
  section: { marginBottom: space.xxl },
  sectionLabelSpace: { marginBottom: space.s },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  field: { marginBottom: space.l },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s,
    marginTop: space.s,
  },
  addressResults: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: space.s,
  },
  addressResult: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: space.l,
    paddingVertical: space.s,
    borderBottomWidth: 1,
  },
  addressResultLast: { borderBottomWidth: 0 },
  addressHint: { marginTop: space.s },
  sliderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: space.s,
  },
  slider: { marginBottom: space.l },
  footer: { gap: space.s },
});

/**
 * "Become a provider" (the gap the role switcher's "you don't have a
 * provider page yet" message used to be a dead end for). Gets a page to the
 * minimum that makes it bookable — category, area, hours, one service. ID
 * and selfie verification is a separate, later step this does not cover.
 */
export default function ProviderSetup() {
  const { data: me, refetch: refetchMe } = useMe();
  const onBack = useBack((me?.onboardingComplete ? '/(tabs)' : '/account-type') as Href);
  const { colors } = useTheme();
  const location = useSessionStore((s) => s.location);
  const areaLabel = useSessionStore((s) => s.areaLabel);
  const pickedLocation = useLocationPickerStore((s) => s.result);
  const clearPickedLocation = useLocationPickerStore((s) => s.clearResult);
  const pendingReferralCode = useInviteStore((s) => s.pendingReferralCode);
  const clearPendingReferralCode = useInviteStore((s) => s.clearPendingReferralCode);
  const { data: categories } = useCategories();
  const createProfile = useCreateProviderProfile();
  const claimReferral = useClaimReferral();

  const [displayName, setDisplayName] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [areaName, setAreaName] = useState(areaLabel ?? '');
  const [addressQuery, setAddressQuery] = useState('');
  const [locationAttached, setLocationAttached] = useState(Boolean(areaLabel));
  const [lat, setLat] = useState(location.lat);
  const [lng, setLng] = useState(location.lng);
  const [workingHoursLabel, setWorkingHoursLabel] = useState('');
  const [yearsExperience, setYearsExperience] = useState(DEFAULT_YEARS);
  const [serviceName, setServiceName] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(DEFAULT_DURATION_MINUTES);
  const [priceUsd, setPriceUsd] = useState(DEFAULT_PRICE_USD);
  const [referralCode, setReferralCode] = useState(pendingReferralCode ?? '');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [referralError, setReferralError] = useState<string | null>(null);
  const [checkingSetup, setCheckingSetup] = useState(false);
  const [setupConfirmed, setSetupConfirmed] = useState(false);

  const [profileCreated, setProfileCreated] = useState(false);
  const addressLookup = useAddressAutocomplete(addressQuery, location);

  const canSubmit =
    (profileCreated ||
      (!!categoryId &&
        displayName.trim().length >= 2 &&
        areaName.trim().length >= 2 &&
        locationAttached &&
        workingHoursLabel.trim().length >= 2 &&
        serviceName.trim().length >= 2)) &&
    !createProfile.isPending &&
    !claimReferral.isPending;

  // Consumed once, right after the map picker pops back to this screen (still
  // mounted underneath it) — see useLocationPickerStore for why this goes
  // through a store rather than route params.
  useEffect(() => {
    if (!pickedLocation) return;
    setLat(pickedLocation.lat);
    setLng(pickedLocation.lng);
    if (pickedLocation.areaName) setAreaName(pickedLocation.areaName);
    setAddressQuery('');
    setLocationAttached(true);
    clearPickedLocation();
  }, [pickedLocation, clearPickedLocation]);

  useEffect(() => {
    if (displayName || !me?.displayName || me.displayName === me.email) return;
    setDisplayName(me.displayName);
  }, [displayName, me?.displayName, me?.email]);

  // Recovers a page that was committed while an earlier app version was
  // waiting on a lost response. It turns the otherwise-dead onboarding form
  // into a confirmed success state as soon as /me knows the page exists.
  useEffect(() => {
    if (!me?.hasProviderProfile || !me.onboardingComplete) return;
    setProfileCreated(true);
    setSetupConfirmed(true);
    setSubmitError(null);
  }, [me?.hasProviderProfile, me?.onboardingComplete]);

  // Creating the page now commits provider role and onboarding in the same
  // API transaction, so this navigation never races a second role mutation.
  const openProviderApp = () => router.replace('/(provider)/jobs');

  // Referral linking is independent of the stylist page itself (an Agent/Referral
  // row, not a ProviderProfile field) — it runs after the page is created so a
  // rejected code never blocks the page from existing, and can be retried without
  // re-submitting the page fields.
  const finishAfterProfile = () => {
    const code = referralCode.trim().toUpperCase();
    if (!code) {
      openProviderApp();
      return;
    }
    setReferralError(null);
    claimReferral.mutate(
      { referralCode: code },
      {
        onSuccess: () => {
          clearPendingReferralCode();
          openProviderApp();
        },
        onError: (error) => {
          setReferralError(describeError(error, "Couldn't apply that referral code."));
        },
      },
    );
  };

  const submit = () => {
    if (!canSubmit) return;
    if (profileCreated) {
      finishAfterProfile();
      return;
    }
    if (!categoryId) return;
    setSubmitError(null);
    createProfile.mutate(
      {
        displayName: displayName.trim(),
        categoryId,
        areaName: areaName.trim(),
        workingHoursLabel: workingHoursLabel.trim(),
        yearsExperience,
        lat,
        lng,
        services: [
          {
            name: serviceName.trim(),
            durationMinutes,
            priceUsdCents: Math.round(priceUsd * 100),
            imageUrls: [],
          },
        ],
      },
      {
        onSuccess: (outcome) => {
          setProfileCreated(true);
          if (outcome.kind === 'confirmed-after-timeout') {
            setSetupConfirmed(true);
            return;
          }
          finishAfterProfile();
        },
        onError: (error) => {
          setSubmitError(describeError(error, "Couldn't set up your page. Try again."));
        },
      },
    );
  };

  const checkSetupStatus = async () => {
    if (checkingSetup) return;
    setCheckingSetup(true);
    setSubmitError(null);
    try {
      const result = await refetchMe();
      if (result.error) throw result.error;
      if (result.data?.hasProviderProfile && result.data.onboardingComplete) {
        setProfileCreated(true);
        setSetupConfirmed(true);
        return;
      }
      setSubmitError('No stylist page was found yet. You can submit the form again.');
    } catch (error) {
      setSubmitError(describeError(error, "Couldn't check your stylist page. Try again."));
    } finally {
      setCheckingSetup(false);
    }
  };

  // A rejected referral never blocks the already-created stylist page.
  const skipReferral = () => {
    clearPendingReferralCode();
    openProviderApp();
  };

  const buttonLabel = createProfile.isPending
    ? 'Setting up…'
    : claimReferral.isPending
      ? 'Applying referral…'
      : profileCreated
        ? 'Continue to Jobs'
        : 'Create my page';

  return (
    <Screen
      header={<ScreenHeader title="Set up your stylist page" onBack={onBack} />}
      footer={
        <View style={styles.footer}>
          {setupConfirmed ? (
            <Text variant="bodyStrong" color="accent700" accessibilityLiveRegion="polite">
              Your stylist page is set up. Continue to open your Jobs screen.
            </Text>
          ) : null}
          {submitError ? (
            <Text
              variant="meta"
              color={color.accent700}
              accessibilityLiveRegion="polite"
              accessibilityRole="alert"
            >
              {submitError}
            </Text>
          ) : null}
          {referralError ? (
            <Text
              variant="meta"
              color={color.accent700}
              accessibilityLiveRegion="polite"
              accessibilityRole="alert"
            >
              {referralError}
            </Text>
          ) : null}
          <Button
            label={buttonLabel}
            onPress={submit}
            block
            size="lg"
            arrow
            disabled={!canSubmit}
          />
          {!profileCreated ? (
            <Button
              label={checkingSetup ? 'Checking setup…' : 'Already submitted? Check setup status'}
              onPress={() => void checkSetupStatus()}
              block
              variant="secondary"
              disabled={checkingSetup || createProfile.isPending}
            />
          ) : null}
          {profileCreated && referralError ? (
            <Button label="Skip and continue" onPress={skipReferral} block variant="ghost" />
          ) : null}
        </View>
      }
    >
      <Text variant="body" color="neutral700" style={styles.intro}>
        This gets your page bookable — a category, your area, your hours, and one priced service. ID
        and selfie verification aren&apos;t part of this yet.
      </Text>

      <View style={styles.field}>
        <TextField
          label="Your name"
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="e.g. Tariro Moyo"
        />
      </View>

      <View style={styles.section}>
        <Text variant="sectionLabel" style={styles.sectionLabelSpace}>
          Category
        </Text>
        <View style={styles.chipRow}>
          {categories?.map((c) => (
            <Chip
              key={c.id}
              label={c.name}
              selected={c.id === categoryId}
              onPress={() => {
                setCategoryId(c.id);
              }}
            />
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.field}>
          <TextField
            label="Business address"
            value={areaName}
            onChangeText={(value) => {
              setAreaName(value);
              setAddressQuery(value);
              setLocationAttached(false);
            }}
            placeholder="Start typing your street or area"
          />
          {addressLookup.status === 'searching' ? (
            <View style={styles.locationRow}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text variant="meta" color="neutral700">
                Finding matching addresses…
              </Text>
            </View>
          ) : null}
          {addressLookup.suggestions.length > 0 ? (
            <View
              style={[
                styles.addressResults,
                { borderColor: colors.divider, backgroundColor: colors.bg },
              ]}
            >
              {addressLookup.suggestions.map((suggestion, index) => (
                <Pressable
                  key={suggestion.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Use ${suggestion.label}`}
                  onPress={() => {
                    setAreaName(suggestion.label);
                    setLat(suggestion.lat);
                    setLng(suggestion.lng);
                    setAddressQuery('');
                    setLocationAttached(true);
                  }}
                  style={[
                    styles.addressResult,
                    { borderColor: colors.divider },
                    index === addressLookup.suggestions.length - 1
                      ? styles.addressResultLast
                      : null,
                  ]}
                >
                  <Text variant="body" numberOfLines={2}>
                    {suggestion.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {!areaName.trim() ? (
            <Text variant="metaSmall" color="neutral600" style={styles.addressHint}>
              Select a matching address and its map coordinates will be attached automatically.
            </Text>
          ) : null}
        </View>
        {locationAttached ? (
          <View style={styles.locationRow}>
            <CheckCircle2 size={17} color={colors.accent} />
            <Text variant="metaSmall" color="neutral600">
              Address attached · {lat.toFixed(5)}, {lng.toFixed(5)}
            </Text>
          </View>
        ) : null}
        {addressLookup.status === 'not-found' || addressLookup.status === 'unavailable' ? (
          <>
            <Text variant="meta" color="accent700" style={styles.sectionLabelSpace}>
              {addressLookup.status === 'not-found'
                ? "We couldn't find that address. Choose it manually on the map."
                : 'Address search is unavailable. Choose the location manually on the map.'}
            </Text>
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
          </>
        ) : null}
      </View>

      <View style={[styles.section, styles.field]}>
        <TextField
          label="Working hours"
          value={workingHoursLabel}
          onChangeText={setWorkingHoursLabel}
          placeholder="e.g. Mon–Sat, 8am–6pm"
        />
      </View>

      <View style={styles.section}>
        <View style={styles.sliderHeader}>
          <Text variant="sectionLabel">Years of experience</Text>
          <Text variant="bodyStrong">{yearsExperience}</Text>
        </View>
        <RangeInput
          min={MIN_YEARS}
          max={MAX_YEARS}
          step={1}
          value={yearsExperience}
          onChange={setYearsExperience}
          accessibilityLabel="Years of experience"
        />
      </View>

      <View style={styles.section}>
        <Text variant="sectionLabel" style={styles.sectionLabelSpace}>
          Your first service
        </Text>
        <View style={styles.field}>
          <TextField
            value={serviceName}
            onChangeText={setServiceName}
            placeholder="e.g. Cornrows"
          />
        </View>

        <View style={styles.sliderHeader}>
          <Text variant="meta" color="neutral700">
            Duration
          </Text>
          <Text variant="bodyStrong">{durationMinutes} min</Text>
        </View>
        <View style={styles.slider}>
          <RangeInput
            min={MIN_DURATION_MINUTES}
            max={MAX_DURATION_MINUTES}
            step={DURATION_STEP_MINUTES}
            value={durationMinutes}
            onChange={setDurationMinutes}
            accessibilityLabel="Service duration"
          />
        </View>

        <View style={styles.sliderHeader}>
          <Text variant="meta" color="neutral700">
            Price
          </Text>
          <Text variant="bodyStrong">${priceUsd}</Text>
        </View>
        <RangeInput
          min={MIN_PRICE_USD}
          max={MAX_PRICE_USD}
          step={PRICE_STEP_USD}
          value={priceUsd}
          onChange={setPriceUsd}
          accessibilityLabel="Service price"
        />
      </View>

      <View style={[styles.section, styles.field]}>
        <Text variant="sectionLabel" style={styles.sectionLabelSpace}>
          Referral code
        </Text>
        <Text variant="meta" color="neutral700" style={styles.sectionLabelSpace}>
          Were you invited by another stylist or agent? Enter their code — optional.
        </Text>
        <TextField
          value={referralCode}
          onChangeText={(value) => {
            setReferralCode(value.toUpperCase());
            setReferralError(null);
          }}
          placeholder="SC-ABC123"
          editable={!claimReferral.isPending}
        />
      </View>
    </Screen>
  );
}

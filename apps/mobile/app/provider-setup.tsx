import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { color, space } from '@sc/tokens';
import { Screen, ScreenHeader, Text, Chip, TextField, RangeInput, Button } from '@sc/ui';
import { useCategories } from '../src/api/hooks/useCategories.js';
import { useCreateProviderProfile } from '../src/api/hooks/useProviders.js';
import { useSessionStore } from '../src/state/index.js';
import { describeError } from '../src/api/errorMessage.js';
import { useBack } from '../src/navigation/useBack.js';

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
  const onBack = useBack('/(tabs)');
  const location = useSessionStore((s) => s.location);
  const areaLabel = useSessionStore((s) => s.areaLabel);
  const { data: categories } = useCategories();
  const createProfile = useCreateProviderProfile();

  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [areaName, setAreaName] = useState(areaLabel ?? '');
  const [workingHoursLabel, setWorkingHoursLabel] = useState('');
  const [yearsExperience, setYearsExperience] = useState(DEFAULT_YEARS);
  const [serviceName, setServiceName] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(DEFAULT_DURATION_MINUTES);
  const [priceUsd, setPriceUsd] = useState(DEFAULT_PRICE_USD);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const canSubmit =
    !!categoryId &&
    areaName.trim().length >= 2 &&
    workingHoursLabel.trim().length >= 2 &&
    serviceName.trim().length >= 2 &&
    !createProfile.isPending;

  const submit = () => {
    if (!categoryId || !canSubmit) return;
    setSubmitError(null);
    createProfile.mutate(
      {
        categoryId,
        areaName: areaName.trim(),
        workingHoursLabel: workingHoursLabel.trim(),
        yearsExperience,
        lat: location.lat,
        lng: location.lng,
        services: [
          {
            name: serviceName.trim(),
            durationMinutes,
            priceUsdCents: Math.round(priceUsd * 100),
          },
        ],
      },
      {
        onSuccess: () => {
          router.replace('/(tabs)');
        },
        onError: (error) => {
          setSubmitError(describeError(error, "Couldn't set up your page. Try again."));
        },
      },
    );
  };

  return (
    <Screen
      header={<ScreenHeader title="Set up your stylist page" onBack={onBack} />}
      footer={
        <View style={styles.footer}>
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
          <Button
            label={createProfile.isPending ? 'Setting up…' : 'Create my page'}
            onPress={submit}
            block
            size="lg"
            arrow
            disabled={!canSubmit}
          />
        </View>
      }
    >
      <Text variant="body" color="neutral700" style={styles.intro}>
        This gets your page bookable — a category, your area, your hours, and one priced service.
        ID and selfie verification aren&apos;t part of this yet.
      </Text>

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

      <View style={[styles.section, styles.field]}>
        <TextField
          label="Area"
          value={areaName}
          onChangeText={setAreaName}
          placeholder="e.g. Avondale"
        />
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
    </Screen>
  );
}

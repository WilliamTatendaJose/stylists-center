import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { formatUsd, vendorFulfilmentSchema } from '@sc/shared';
import { space } from '@sc/tokens';
import {
  Button,
  EmptyPanel,
  RadioCard,
  Screen,
  ScreenHeader,
  Text,
  TextField,
  useTheme,
} from '@sc/ui';
import { useUpdateVendorFulfilment, useVendorMe } from '../../src/api/hooks/useMarket.js';
import { describeError } from '../../src/api/errorMessage.js';
import { useBack } from '../../src/navigation/useBack.js';

const styles = StyleSheet.create({
  intro: { marginBottom: space.xl },
  section: { marginBottom: space.xl },
  sectionLabel: { marginBottom: space.m },
  field: { marginBottom: space.l },
  radioGap: { marginBottom: space.s },
  error: { marginBottom: space.m },
  footer: { gap: space.s },
});

/** Splits a typed list of areas on commas and new lines, dropping blanks. */
function parseAreas(text: string): string[] {
  return text
    .split(/[,\n]/)
    .map((area) => area.trim())
    .filter(Boolean);
}

/**
 * How a shop gets orders to buyers: whether it delivers, the delivery charge,
 * the areas it covers, and where and when buyers collect. Areas are free text
 * because that is how people describe them ("Avondale", "Borrowdale and
 * Mount Pleasant"); buyers read them, the app does not match addresses.
 */
export default function VendorSettings() {
  const { colors } = useTheme();
  const onBack = useBack('/vendor/shop');
  const { data: vendorMe } = useVendorMe();
  const update = useUpdateVendorFulfilment();
  const application = vendorMe?.application ?? null;

  const [delivers, setDelivers] = useState(false);
  const [charge, setCharge] = useState('');
  const [areas, setAreas] = useState('');
  const [collectionAddress, setCollectionAddress] = useState('');
  const [collectionHours, setCollectionHours] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (loaded || !application) return;
    setLoaded(true);
    setDelivers(application.delivers);
    setCharge(
      application.deliveryChargeUsdCents > 0
        ? (application.deliveryChargeUsdCents / 100).toFixed(2)
        : '',
    );
    setAreas(application.deliveryAreas.join(', '));
    setCollectionAddress(application.collectionAddress ?? application.shopAddress);
    setCollectionHours(application.collectionHours ?? '');
  }, [application, loaded]);

  if (application?.status !== 'approved') {
    return (
      <Screen header={<ScreenHeader title="Delivery and collection" onBack={onBack} />}>
        <EmptyPanel body="These settings open once your shop is approved." />
      </Screen>
    );
  }

  const save = () => {
    setError(null);
    const chargeCents = Math.round(Number(charge || '0') * 100);
    if (!Number.isFinite(chargeCents) || chargeCents < 0) {
      setError('Enter the delivery charge in dollars, for example 2.50.');
      return;
    }
    const parsed = vendorFulfilmentSchema.safeParse({
      delivers,
      deliveryChargeUsdCents: delivers ? chargeCents : 0,
      deliveryAreas: delivers ? parseAreas(areas) : [],
      collectionAddress: collectionAddress.trim() || null,
      collectionHours: collectionHours.trim() || null,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check your details and try again.');
      return;
    }
    update.mutate(parsed.data, {
      onSuccess: () => {
        router.back();
      },
      onError: (reason) => {
        setError(describeError(reason, "Couldn't save your settings. Try again."));
      },
    });
  };

  return (
    <Screen
      header={<ScreenHeader title="Delivery and collection" onBack={onBack} />}
      footer={
        <View style={styles.footer}>
          <Button
            label={update.isPending ? 'Saving…' : 'Save'}
            block
            size="lg"
            disabled={update.isPending}
            onPress={save}
          />
        </View>
      }
    >
      <Text variant="body" color="neutral700" style={styles.intro}>
        Buyers choose delivery or collection when they order, and pay you directly.
      </Text>

      <View style={styles.section}>
        <Text variant="sectionLabel" style={styles.sectionLabel}>
          Delivery
        </Text>
        <View style={styles.radioGap}>
          <RadioCard
            title="I deliver"
            description="Buyers in your areas can ask for delivery."
            dot
            selected={delivers}
            onPress={() => {
              setDelivers(true);
            }}
          />
        </View>
        <RadioCard
          title="Collection only"
          description="Buyers pick up from your shop."
          dot
          selected={!delivers}
          onPress={() => {
            setDelivers(false);
          }}
        />
      </View>

      {delivers ? (
        <View style={styles.section}>
          <View style={styles.field}>
            <TextField
              label="Delivery charge (USD)"
              value={charge}
              onChangeText={setCharge}
              keyboardType="decimal-pad"
              placeholder="0.00"
            />
            <Text variant="metaSmall" color="neutral600">
              Added to each delivery order. Buyers see{' '}
              {formatUsd(Math.round(Number(charge || '0') * 100))}.
            </Text>
          </View>
          <TextField
            label="Areas you deliver to"
            value={areas}
            onChangeText={setAreas}
            multiline
            numberOfLines={3}
            placeholder="Avondale, Borrowdale, Mount Pleasant"
          />
          <Text variant="metaSmall" color="neutral600">
            Separate areas with commas.
          </Text>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text variant="sectionLabel" style={styles.sectionLabel}>
          Collection
        </Text>
        <View style={styles.field}>
          <TextField
            label="Collection address"
            value={collectionAddress}
            onChangeText={setCollectionAddress}
            placeholder="Where buyers collect"
          />
        </View>
        <TextField
          label="Collection hours"
          value={collectionHours}
          onChangeText={setCollectionHours}
          placeholder="Mon to Sat, 8 am to 5 pm"
        />
      </View>

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
    </Screen>
  );
}

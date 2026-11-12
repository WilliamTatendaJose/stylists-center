import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import { applyVendorSchema, MAX_PREMISES_PHOTOS } from '@sc/shared';
import { space } from '@sc/tokens';
import { Button, Card, Pressable, Screen, ScreenHeader, Text, TextField, useTheme } from '@sc/ui';
import { useApplyVendor, useVendorMe } from '../../src/api/hooks/useMarket.js';
import { useLocationPickerStore, useSessionStore } from '../../src/state/index.js';
import { useAddressAutocomplete } from '../../src/location/useAddressAutocomplete.js';
import { describeError } from '../../src/api/errorMessage.js';
import { PhotoPicker } from '../../src/components/PhotoPicker.js';
import { useBack } from '../../src/navigation/useBack.js';

/** Tags map-picker results meant for this screen (see useLocationPickerStore). */
const SHOP_PIN_PURPOSE = 'vendor-shop';

const styles = StyleSheet.create({
  intro: { marginBottom: space.xl },
  field: { marginBottom: space.l },
  location: { padding: space.l, marginBottom: space.l },
  error: { marginBottom: space.m },
  footer: { gap: space.s },
  // Same address suggestions as stylist sign-up (provider-setup.tsx).
  searchingRow: { flexDirection: 'row', alignItems: 'center', gap: space.s, marginTop: space.s },
  addressResults: { borderWidth: 1, borderRadius: 16, overflow: 'hidden', marginTop: space.s },
  addressResult: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: space.l,
    paddingVertical: space.s,
    borderBottomWidth: 1,
  },
  addressResultLast: { borderBottomWidth: 0 },
});

/**
 * Apply to sell. Staff check the shop details and photos before anyone can
 * list products, so this asks for what a reviewer needs to believe the shop
 * is real: a name, an address, where it is on the map, photos of the
 * premises and someone to contact. A rejected application opens here again,
 * prefilled, so fixing it is a small edit rather than starting over.
 */
export default function VendorApply() {
  const { colors } = useTheme();
  const onBack = useBack('/vendor/shop');
  const { data: vendorMe } = useVendorMe();
  const apply = useApplyVendor();
  const existing = vendorMe?.application ?? null;

  const [businessName, setBusinessName] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [shopAddress, setShopAddress] = useState('');
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  // Searching starts as the address is typed, as in stylist sign-up. Picking
  // a suggestion fills the address and drops the pin; the map can still be
  // used afterwards to move it onto the exact shop.
  const sessionLocation = useSessionStore((s) => s.location);
  const [addressQuery, setAddressQuery] = useState('');
  const addressLookup = useAddressAutocomplete(addressQuery, pin ?? sessionLocation);
  const pickedLocation = useLocationPickerStore((s) => s.result);
  const clearPickedLocation = useLocationPickerStore((s) => s.clearResult);

  // The map picker pops back to this screen (still mounted underneath) and
  // leaves its result in the store; take only the pick made for the shop.
  useEffect(() => {
    if (pickedLocation?.purpose !== SHOP_PIN_PURPOSE) return;
    setPin({ lat: pickedLocation.lat, lng: pickedLocation.lng });
    // Fill the address from the map only if nothing was typed.
    if (pickedLocation.areaName)
      setShopAddress((typed) => typed.trim() || pickedLocation.areaName || '');
    clearPickedLocation();
  }, [pickedLocation, clearPickedLocation]);

  const openMap = () => {
    setError(null);
    router.push({
      pathname: '/map/pick-location',
      params: {
        purpose: SHOP_PIN_PURPOSE,
        ...(shopAddress.trim() ? { q: shopAddress.trim() } : {}),
        ...(pin ? { lat: String(pin.lat), lng: String(pin.lng) } : {}),
      },
    });
  };

  // Prefill once from a previous application; never overwrite what is being typed.
  useEffect(() => {
    if (loaded || !existing) return;
    setLoaded(true);
    setBusinessName(existing.businessName);
    setRegistrationNumber(existing.registrationNumber ?? '');
    setShopAddress(existing.shopAddress);
    if (existing.shopLat !== null && existing.shopLng !== null) {
      setPin({ lat: existing.shopLat, lng: existing.shopLng });
    }
    setPhotos(existing.premisesPhotoUrls);
    setContactName(existing.contactName);
    setContactPhone(existing.contactPhone);
  }, [existing, loaded]);

  const isApproved = existing?.status === 'approved';

  const pinCurrentLocation = async () => {
    setError(null);
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== Location.PermissionStatus.GRANTED) {
        setError('Allow location access, or stand at your shop and try again.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setPin({ lat: position.coords.latitude, lng: position.coords.longitude });
    } catch {
      setError("Couldn't find your location. Try again at the shop.");
    } finally {
      setLocating(false);
    }
  };

  const submit = () => {
    setError(null);
    const parsed = applyVendorSchema.safeParse({
      businessName,
      registrationNumber,
      shopAddress,
      ...(pin ? { shopLat: pin.lat, shopLng: pin.lng } : {}),
      premisesPhotoUrls: photos,
      contactName,
      contactPhone,
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const path = issue?.path[0];
      setError(
        path === 'premisesPhotoUrls'
          ? 'Add at least one photo of your shop.'
          : path === 'businessName'
            ? 'Enter your business name.'
            : path === 'shopAddress'
              ? 'Enter your shop address.'
              : path === 'contactName'
                ? 'Enter the name of the person we can contact.'
                : path === 'contactPhone'
                  ? 'Enter a valid mobile number for the contact person.'
                  : (issue?.message ?? 'Check your details and try again.'),
      );
      return;
    }
    apply.mutate(parsed.data, {
      onSuccess: () => {
        router.replace('/vendor/shop');
      },
      onError: (reason) => {
        setError(describeError(reason, "Couldn't send your application. Try again."));
      },
    });
  };

  return (
    <Screen
      header={<ScreenHeader title="Sell on StylistsCenter" onBack={onBack} />}
      footer={
        <View style={styles.footer}>
          <Button
            label={
              apply.isPending ? 'Sending…' : existing ? 'Send again for review' : 'Send for review'
            }
            block
            size="lg"
            disabled={apply.isPending || isApproved}
            onPress={submit}
          />
        </View>
      }
    >
      <Text variant="body" color="neutral700" style={styles.intro}>
        Only verified beauty businesses with a physical shop can sell. We will review your details
        and photos, and tell you once you are approved. Buyers pay you directly when they collect or
        receive their order.
      </Text>

      {isApproved ? (
        <Text variant="meta" color="neutral700" style={styles.error}>
          Your shop is already approved.
        </Text>
      ) : null}

      <View style={styles.field}>
        <TextField
          label="Business name"
          value={businessName}
          onChangeText={setBusinessName}
          placeholder="As it appears on your shop"
        />
      </View>
      <View style={styles.field}>
        <TextField
          label="Registration number (if registered)"
          value={registrationNumber}
          onChangeText={setRegistrationNumber}
          placeholder="Leave empty if not registered"
        />
      </View>
      <View style={styles.field}>
        <TextField
          label="Shop address"
          value={shopAddress}
          onChangeText={(value) => {
            setShopAddress(value);
            setAddressQuery(value);
          }}
          placeholder="Start typing your street or area"
        />
        {addressLookup.status === 'searching' ? (
          <View style={styles.searchingRow}>
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
                  setShopAddress(suggestion.label);
                  setPin({ lat: suggestion.lat, lng: suggestion.lng });
                  setAddressQuery('');
                }}
                style={[
                  styles.addressResult,
                  { borderColor: colors.divider },
                  index === addressLookup.suggestions.length - 1 ? styles.addressResultLast : null,
                ]}
              >
                <Text variant="body" numberOfLines={2}>
                  {suggestion.label}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {addressLookup.status === 'not-found' ? (
          <Text variant="metaSmall" color="neutral600" style={{ marginTop: space.s }}>
            No match found. Use the map below to place your shop.
          </Text>
        ) : null}
      </View>

      <Card bordered style={styles.location}>
        <Text variant="cardTitle">Where is your shop?</Text>
        <Text variant="meta" color="neutral700" style={{ marginTop: space.xs }}>
          {pin
            ? `Pinned at ${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}. Buyers will see how far you are.`
            : 'Find your address on the map and move the pin onto your shop, or stand at your shop and use your current location.'}
        </Text>
        <Button
          label={pin ? 'Move the pin on the map' : 'Find on the map'}
          block
          style={{ marginTop: space.m }}
          onPress={openMap}
        />
        <Button
          label={locating ? 'Finding you…' : 'Use my current location'}
          variant="secondary"
          block
          style={{ marginTop: space.s }}
          disabled={locating}
          onPress={() => {
            void pinCurrentLocation();
          }}
        />
      </Card>

      <View style={styles.field}>
        <PhotoPicker
          label="Photos of your shop"
          helpText="Show the outside and inside of your shop. Staff use these to check it is real."
          urls={photos}
          maxPhotos={MAX_PREMISES_PHOTOS}
          uploadEndpoint="/v1/vendors/images"
          disabled={apply.isPending}
          onChange={setPhotos}
          onError={(message) => {
            setError(message || null);
          }}
        />
      </View>

      <View style={styles.field}>
        <TextField
          label="Contact person"
          value={contactName}
          onChangeText={setContactName}
          placeholder="Who should we call?"
        />
      </View>
      <View style={styles.field}>
        <TextField
          label="Contact phone"
          value={contactPhone}
          onChangeText={setContactPhone}
          keyboardType="phone-pad"
          placeholder="0771234567"
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

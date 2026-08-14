import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { MapPin } from 'lucide-react-native';
import * as WebBrowser from 'expo-web-browser';
import { deriveInitials, formatInHarare, formatUsd, type PaymentMethod } from '@sc/shared';
import { color, space } from '@sc/tokens';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyPanel,
  ListRow,
  RadioCard,
  Screen,
  ScreenHeader,
  SectionLabel,
  Sheet,
  Text,
  TextField,
} from '@sc/ui';
import {
  useAddProviderService,
  usePaySubscription,
  useProviderManagementProfile,
  useProviderSubscription,
  useUpdateProviderProfile,
} from '../../src/api/hooks/useProviders.js';
import { useSetActiveRole } from '../../src/api/hooks/useMe.js';
import { describeError } from '../../src/api/errorMessage.js';
import { useAuthStore } from '../../src/state/useAuthStore.js';
import { useSessionStore } from '../../src/state/index.js';

const styles = StyleSheet.create({
  section: { marginBottom: space.xxl },
  title: { marginBottom: space.m },
  field: { marginBottom: space.m },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: space.m },
  submitButton: { marginTop: space.m },
  grow: { flex: 1, minWidth: 0 },
  error: { marginBottom: space.m },
  roleSwitch: { marginTop: space.l },
  signOut: { marginTop: space.m },
  previewCard: { padding: space.l, marginBottom: space.xxl },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: space.m },
  previewText: { flex: 1, minWidth: 0 },
  previewLabel: { marginBottom: space.m },
  subscriptionCard: { padding: space.l, marginBottom: space.xxl },
  subscriptionTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  subscriptionMeta: { marginTop: 2 },
  subscriptionAction: { marginTop: space.m },
  sheetTitle: { marginBottom: space.s },
  sheetBody: { marginBottom: space.xl },
  radioGap: { marginBottom: space.s },
  sheetError: { marginBottom: space.m },
});

export default function ProviderProfile() {
  const { data, isError, refetch } = useProviderManagementProfile();
  const updateProfile = useUpdateProviderProfile();
  const addService = useAddProviderService();
  const { data: subscription } = useProviderSubscription();
  const paySubscription = usePaySubscription();
  const setActiveRole = useSetActiveRole();
  const deviceLocation = useSessionStore((state) => state.location);
  const locationSource = useSessionStore((state) => state.locationSource);
  const signOut = useAuthStore((state) => state.signOut);

  const [displayName, setDisplayName] = useState('');
  const [areaName, setAreaName] = useState('');
  const [workingHoursLabel, setWorkingHoursLabel] = useState('');
  const [lat, setLat] = useState(0);
  const [lng, setLng] = useState(0);
  const [serviceName, setServiceName] = useState('');
  const [duration, setDuration] = useState('60');
  const [price, setPrice] = useState('20');
  const [error, setError] = useState<string | null>(null);
  const [payMethod, setPayMethod] = useState<PaymentMethod>('ecocash');
  const [subSheetOpen, setSubSheetOpen] = useState(false);
  const [subError, setSubError] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setDisplayName(data.displayName);
    setAreaName(data.areaName);
    setWorkingHoursLabel(data.workingHoursLabel);
    setLat(data.lat);
    setLng(data.lng);
  }, [data]);

  if (isError && !data) {
    return (
      <Screen hasTabBar header={<ScreenHeader title="My page" showBack={false} />}>
        <EmptyPanel title="Couldn't load your page" body="Check your connection and try again." />
        <Button label="Try again" onPress={() => void refetch()} />
      </Screen>
    );
  }

  const save = () => {
    setError(null);
    updateProfile.mutate(
      {
        displayName: displayName.trim(),
        areaName: areaName.trim(),
        workingHoursLabel: workingHoursLabel.trim(),
        lat,
        lng,
      },
      { onError: (reason) => setError(describeError(reason, "Couldn't save your page.")) },
    );
  };

  const createService = () => {
    setError(null);
    addService.mutate(
      {
        name: serviceName.trim(),
        durationMinutes: Number(duration),
        priceUsdCents: Math.round(Number(price) * 100),
      },
      {
        onSuccess: () => {
          setServiceName('');
          setDuration('60');
          setPrice('20');
        },
        onError: (reason) => setError(describeError(reason, "Couldn't add that service.")),
      },
    );
  };

  const paySub = () => {
    setSubError(null);
    paySubscription.mutate(
      { paymentMethod: payMethod },
      {
        onSuccess: (result) => {
          setSubSheetOpen(false);
          if (result.checkoutUrl) void WebBrowser.openBrowserAsync(result.checkoutUrl);
        },
        onError: (reason) =>
          setSubError(describeError(reason, "Couldn't take that payment. Try again.")),
      },
    );
  };

  const switchToClient = () => {
    setError(null);
    setActiveRole.mutate('client', {
      onSuccess: () => {
        router.replace('/(tabs)');
      },
      onError: (reason) => setError(describeError(reason, "Couldn't switch roles. Try again.")),
    });
  };

  const profileValid =
    displayName.trim().length >= 2 &&
    areaName.trim().length >= 2 &&
    workingHoursLabel.trim().length >= 2;
  const serviceValid =
    serviceName.trim().length >= 2 && Number(duration) >= 10 && Number(price) >= 1;

  return (
    <>
      <Screen hasTabBar header={<ScreenHeader title="My page" showBack={false} />}>
        {error ? (
          <Text variant="meta" color={color.accent700} style={styles.error}>
            {error}
          </Text>
        ) : null}

        {subscription ? (
          <Card bordered style={styles.subscriptionCard}>
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
                label={subscription.active ? 'Active' : 'Past due'}
                tone={subscription.active ? 'accent100' : 'accent'}
              />
            </View>
            {!subscription.active ? (
              <Text variant="meta" color="neutral700" style={styles.subscriptionMeta}>
                You won&apos;t appear in search or smart-match until this is paid.
              </Text>
            ) : null}
            <Button
              label={
                subscription.active ? 'Renew early' : `Pay ${formatUsd(subscription.priceUsdCents)}`
              }
              variant={subscription.active ? 'secondary' : 'primary'}
              block
              style={styles.subscriptionAction}
              onPress={() => {
                setSubError(null);
                setSubSheetOpen(true);
              }}
            />
          </Card>
        ) : null}

        <Card bordered style={styles.previewCard}>
          <Text variant="metaSmall" color="neutral600" style={styles.previewLabel}>
            HOW CLIENTS SEE YOU
          </Text>
          <View style={styles.previewRow}>
            <Avatar initials={deriveInitials(displayName || 'Your name')} size={54} />
            <View style={styles.previewText}>
              <Text variant="cardTitle" numberOfLines={1}>
                {displayName || 'Your name'}
              </Text>
              <Text variant="meta" color="neutral700" numberOfLines={1}>
                {areaName || 'Your area'}
              </Text>
              <Text variant="metaSmall" color="neutral600" numberOfLines={1}>
                {workingHoursLabel || 'Working hours'}
              </Text>
            </View>
          </View>
        </Card>

        <View style={styles.section}>
          <Text variant="sectionLabel" style={styles.title}>
            Public details
          </Text>
          <View style={styles.field}>
            <TextField label="Provider name" value={displayName} onChangeText={setDisplayName} />
          </View>
          <View style={styles.field}>
            <TextField label="Area" value={areaName} onChangeText={setAreaName} />
          </View>
          <View style={styles.field}>
            <TextField
              label="Working hours"
              value={workingHoursLabel}
              onChangeText={setWorkingHoursLabel}
            />
          </View>
          <Button
            label={
              locationSource === 'device'
                ? 'Use my current location'
                : 'Current location unavailable'
            }
            variant="secondary"
            disabled={locationSource !== 'device'}
            onPress={() => {
              setLat(deviceLocation.lat);
              setLng(deviceLocation.lng);
            }}
          />
          <View style={[styles.row, { marginTop: space.s }]}>
            <MapPin size={16} color={color.neutral700} />
            <Text variant="meta" color="neutral700" style={styles.grow}>
              {lat.toFixed(5)}, {lng.toFixed(5)}
            </Text>
          </View>
          <Button
            label={updateProfile.isPending ? 'Saving…' : 'Save page'}
            block
            style={styles.submitButton}
            disabled={!profileValid || updateProfile.isPending}
            onPress={save}
          />
        </View>

        <View style={styles.section}>
          <SectionLabel label="Services" count={data?.services.length} />
          {data?.services.length === 0 ? (
            <EmptyPanel body="No services yet — add your first one below." />
          ) : (
            data?.services.map((service) => (
              <ListRow
                key={service.id}
                avatar={{ initials: deriveInitials(service.name), size: 44 }}
                title={service.name}
                meta={`${service.durationMinutes} min`}
                rightPrimary={formatUsd(service.priceUsdCents)}
              />
            ))
          )}
          <View style={[styles.field, { marginTop: space.m }]}>
            <TextField
              label="New service"
              value={serviceName}
              onChangeText={setServiceName}
              placeholder="e.g. Knotless braids"
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
          <Button
            label={addService.isPending ? 'Adding…' : 'Add service'}
            variant="secondary"
            block
            style={styles.submitButton}
            disabled={!serviceValid || addService.isPending}
            onPress={createService}
          />
        </View>

        <Button
          label={setActiveRole.isPending ? 'Switching…' : 'Switch to client view'}
          variant="secondary"
          block
          style={styles.roleSwitch}
          disabled={setActiveRole.isPending}
          onPress={switchToClient}
        />

        <Button
          label="Sign out"
          variant="ghost"
          style={styles.signOut}
          onPress={() => void signOut()}
        />
      </Screen>

      <Sheet
        open={subSheetOpen}
        onClose={() => {
          setSubSheetOpen(false);
        }}
      >
        <Text variant="cardTitle" style={styles.sheetTitle}>
          Pay {subscription ? formatUsd(subscription.priceUsdCents) : ''}
        </Text>
        <Text variant="body" color="neutral700" style={styles.sheetBody}>
          Extends your subscription by 30 days from today (or from your current renewal date, if it
          hasn&apos;t lapsed yet).
        </Text>

        {subError ? (
          <Text
            variant="meta"
            color={color.accent700}
            style={styles.sheetError}
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
          >
            {subError}
          </Text>
        ) : null}

        <View style={styles.radioGap}>
          <RadioCard
            title="Paynow — pay securely"
            description="Choose EcoCash, card, or another supported Paynow method."
            dot
            selected={payMethod === 'ecocash'}
            onPress={() => {
              setPayMethod('ecocash');
            }}
          />
        </View>
        <RadioCard
          title="Cash"
          description="You've paid the platform directly (e.g. in person or via agent) and are confirming it here."
          dot
          selected={payMethod === 'cash'}
          onPress={() => {
            setPayMethod('cash');
          }}
        />
        <Button
          label={paySubscription.isPending ? 'Paying…' : 'Pay'}
          block
          style={styles.subscriptionAction}
          disabled={paySubscription.isPending}
          onPress={paySub}
        />
      </Sheet>
    </>
  );
}

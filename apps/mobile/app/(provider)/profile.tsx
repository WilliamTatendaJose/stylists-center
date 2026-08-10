import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { MapPin } from 'lucide-react-native';
import { deriveInitials, formatUsd } from '@sc/shared';
import { color, space } from '@sc/tokens';
import {
  Avatar,
  Button,
  Card,
  EmptyPanel,
  ListRow,
  Screen,
  ScreenHeader,
  SectionLabel,
  Text,
  TextField,
} from '@sc/ui';
import {
  useAddProviderService,
  useProviderManagementProfile,
  useUpdateProviderProfile,
} from '../../src/api/hooks/useProviders.js';
import { describeError } from '../../src/api/errorMessage.js';
import { useAuthStore } from '../../src/state/useAuthStore.js';
import { useSessionStore } from '../../src/state/index.js';

const styles = StyleSheet.create({
  section: { marginBottom: space.xxl },
  title: { marginBottom: space.m },
  field: { marginBottom: space.m },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: space.m },
  grow: { flex: 1, minWidth: 0 },
  error: { marginBottom: space.m },
  signOut: { marginTop: space.l },
  previewCard: { padding: space.l, marginBottom: space.l },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: space.m },
  previewText: { flex: 1, minWidth: 0 },
  previewLabel: { marginBottom: space.s },
});

export default function ProviderProfile() {
  const { data, isError, refetch } = useProviderManagementProfile();
  const updateProfile = useUpdateProviderProfile();
  const addService = useAddProviderService();
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

  const profileValid =
    displayName.trim().length >= 2 &&
    areaName.trim().length >= 2 &&
    workingHoursLabel.trim().length >= 2;
  const serviceValid =
    serviceName.trim().length >= 2 && Number(duration) >= 10 && Number(price) >= 1;

  return (
    <Screen hasTabBar header={<ScreenHeader title="My page" showBack={false} />}>
      {error ? (
        <Text variant="meta" color={color.accent700} style={styles.error}>
          {error}
        </Text>
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
            locationSource === 'device' ? 'Use my current location' : 'Current location unavailable'
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
          disabled={!serviceValid || addService.isPending}
          onPress={createService}
        />
      </View>

      <Button
        label="Sign out"
        variant="ghost"
        style={styles.signOut}
        onPress={() => void signOut()}
      />
    </Screen>
  );
}

import { useEffect, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { router } from 'expo-router';
import { formatInHarare, weeklyHoursSchema, type WeeklyInterval } from '@sc/shared';
import { space } from '@sc/tokens';
import { Button, Card, Screen, ScreenHeader, Text, TextField } from '@sc/ui';
import {
  useAddProviderTimeOff,
  useProviderCalendar,
  useRemoveProviderTimeOff,
  useUpdateProviderCalendar,
} from '../src/api/hooks/useProviders.js';
import { describeError } from '../src/api/errorMessage.js';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const styles = StyleSheet.create({
  section: { marginBottom: space.xl, gap: space.m },
  dayCard: { padding: space.l, gap: space.s },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.m,
  },
  half: { flex: 1 },
  label: { marginBottom: space.s },
});

function toHarareIso(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2} ([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const date = new Date(`${value.replace(' ', 'T')}:00+02:00`);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export default function ProviderCalendar() {
  const { data, isError, refetch } = useProviderCalendar();
  const save = useUpdateProviderCalendar();
  const addTimeOff = useAddProviderTimeOff();
  const removeTimeOff = useRemoveProviderTimeOff();
  const [hours, setHours] = useState<WeeklyInterval[]>([]);
  const [offStart, setOffStart] = useState('');
  const [offEnd, setOffEnd] = useState('');
  const [offNote, setOffNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (data) setHours(data.weeklyHours);
  }, [data]);

  const updateInterval = (
    dayOfWeek: number,
    index: number,
    field: 'opensAt' | 'closesAt',
    value: string,
  ) => {
    setHours((current) => {
      const day = current.filter((item) => item.dayOfWeek === dayOfWeek);
      const target = day[index];
      if (!target) return current;
      return current.map((item) => (item === target ? { ...item, [field]: value } : item));
    });
  };

  const saveHours = () => {
    const parsed = weeklyHoursSchema.safeParse(hours);
    if (!parsed.success) {
      setError('Check the time format and make sure working periods do not overlap.');
      return;
    }
    setError(null);
    save.mutate(
      { weeklyHours: parsed.data },
      { onError: (reason) => setError(describeError(reason, "Couldn't save your calendar.")) },
    );
  };

  const saveTimeOff = () => {
    const startsAt = toHarareIso(offStart);
    const endsAt = toHarareIso(offEnd);
    if (!startsAt || !endsAt || startsAt >= endsAt) {
      setError('Enter valid start and end times, such as 2026-10-05 09:00.');
      return;
    }
    setError(null);
    addTimeOff.mutate(
      { startsAt, endsAt, note: offNote.trim() || undefined },
      {
        onSuccess: () => {
          setOffStart('');
          setOffEnd('');
          setOffNote('');
        },
        onError: (reason) => setError(describeError(reason, "Couldn't add time off.")),
      },
    );
  };

  return (
    <Screen header={<ScreenHeader title="My calendar" onBack={() => router.back()} />}>
      <Text variant="body" color="neutral700" style={styles.section}>
        Choose when clients can book you. Times use Harare local time. Existing bookings remain
        protected.
      </Text>
      {isError && !data ? (
        <Button label="Retry loading calendar" onPress={() => void refetch()} />
      ) : null}
      {data && !data.configured ? (
        <Text variant="meta" color="neutral700" style={styles.section}>
          Your page currently uses 07:00–20:00 every day. Save your actual hours below.
        </Text>
      ) : null}
      {DAYS.map((day, dayOfWeek) => {
        const intervals = hours.filter((item) => item.dayOfWeek === dayOfWeek);
        return (
          <Card key={day} bordered style={[styles.dayCard, styles.section]}>
            <View style={styles.row}>
              <Text variant="cardTitle">{day}</Text>
              <Switch
                accessibilityLabel={`${day} bookable`}
                value={intervals.length > 0}
                onValueChange={(enabled) =>
                  setHours((current) =>
                    enabled
                      ? [...current, { dayOfWeek, opensAt: '09:00', closesAt: '17:00' }]
                      : current.filter((item) => item.dayOfWeek !== dayOfWeek),
                  )
                }
              />
            </View>
            {intervals.map((interval, index) => (
              <View key={`${day}-${String(index)}`}>
                <View style={styles.row}>
                  <View style={styles.half}>
                    <TextField
                      label="From (HH:mm)"
                      value={interval.opensAt}
                      onChangeText={(value) => updateInterval(dayOfWeek, index, 'opensAt', value)}
                    />
                  </View>
                  <View style={styles.half}>
                    <TextField
                      label="Until (HH:mm)"
                      value={interval.closesAt}
                      onChangeText={(value) => updateInterval(dayOfWeek, index, 'closesAt', value)}
                    />
                  </View>
                </View>
                {intervals.length > 1 ? (
                  <Button
                    label="Remove period"
                    variant="ghost"
                    onPress={() =>
                      setHours((current) => current.filter((item) => item !== interval))
                    }
                  />
                ) : null}
              </View>
            ))}
            {intervals.length > 0 && intervals.length < 4 ? (
              <Button
                label="Add another period or break"
                variant="ghost"
                onPress={() =>
                  setHours((current) => [
                    ...current,
                    { dayOfWeek, opensAt: '13:00', closesAt: '17:00' },
                  ])
                }
              />
            ) : null}
          </Card>
        );
      })}
      {error ? (
        <Text variant="meta" color="accent700" accessibilityRole="alert" style={styles.section}>
          {error}
        </Text>
      ) : null}
      <Button
        label={save.isPending ? 'Saving…' : 'Save weekly hours'}
        block
        disabled={!data || save.isPending}
        onPress={saveHours}
      />

      <View style={styles.section} />
      <Text variant="sectionLabel" style={styles.label}>
        Time off
      </Text>
      <Text variant="meta" color="neutral700" style={styles.section}>
        Block holidays or personal appointments. Start and end use YYYY-MM-DD HH:mm in Harare time.
      </Text>
      <View style={styles.section}>
        <TextField label="Start" value={offStart} onChangeText={setOffStart} />
        <TextField label="End" value={offEnd} onChangeText={setOffEnd} />
        <TextField label="Note (optional)" value={offNote} onChangeText={setOffNote} />
        <Button
          label={addTimeOff.isPending ? 'Adding…' : 'Add time off'}
          block
          disabled={addTimeOff.isPending}
          onPress={saveTimeOff}
        />
      </View>
      {data?.timeOff.map((block) => (
        <Card key={block.id} bordered style={[styles.dayCard, styles.section]}>
          <Text variant="cardTitle">{block.note || 'Time off'}</Text>
          <Text variant="meta" color="neutral700">
            {formatInHarare(block.startsAt, 'd MMM yyyy, HH:mm')} –{' '}
            {formatInHarare(block.endsAt, 'd MMM yyyy, HH:mm')}
          </Text>
          <Button
            label="Remove time off"
            variant="ghost"
            disabled={removeTimeOff.isPending}
            onPress={() =>
              removeTimeOff.mutate(block.id, {
                onError: (reason) => setError(describeError(reason, "Couldn't remove time off.")),
              })
            }
          />
        </Card>
      ))}
      <View style={{ height: space.xxl }} />
    </Screen>
  );
}

import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { space } from '@sc/tokens';
import { Button, Pill, Sheet, Text } from '@sc/ui';
import { useMe, useSetActiveRole } from '../api/hooks/useMe.js';
import { useSessionStore } from '../state/index.js';
import { describeError } from '../api/errorMessage.js';

const styles = StyleSheet.create({
  title: { marginBottom: space.s },
  body: { marginBottom: space.xl },
  error: { marginBottom: space.m },
  actions: { gap: space.s },
});

/** The same role control is used in both tab shells so switching never feels like a mode change. */
export function RoleSwitcher() {
  const { data: me } = useMe();
  const setActiveRole = useSetActiveRole();
  const storedRole = useSessionStore((state) => state.activeRole);
  const activeRole = me?.activeRole ?? storedRole;
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isProvider = activeRole === 'provider';
  const hasProviderProfile = me?.hasProviderProfile ?? isProvider;

  const close = () => {
    setOpen(false);
    setError(null);
  };

  const switchRole = () => {
    setError(null);
    setActiveRole.mutate(isProvider ? 'client' : 'provider', {
      onSuccess: () => {
        close();
        router.replace(isProvider ? '/(tabs)' : '/(provider)/jobs');
      },
      onError: (reason) => setError(describeError(reason, "Couldn't switch roles. Try again.")),
    });
  };

  return (
    <>
      <Pill
        label={isProvider ? 'Stylist' : 'Client'}
        showChevron
        onPress={() => {
          setError(null);
          setOpen(true);
        }}
      />
      <Sheet open={open} onClose={close}>
        <Text variant="cardTitle" style={styles.title}>
          {isProvider ? 'Switch to client' : 'Switch to stylist'}
        </Text>
        <Text variant="body" color="neutral700" style={styles.body}>
          One account, two sides. Your bookings, messages, and profile stay connected.
        </Text>
        {error ? (
          <Text
            variant="meta"
            color="accent700"
            style={styles.error}
            accessibilityRole="alert"
          >
            {error}
          </Text>
        ) : null}
        <View style={styles.actions}>
          {hasProviderProfile ? (
            <Button
              label={
                setActiveRole.isPending
                  ? 'Switching…'
                  : isProvider
                    ? 'Switch to client'
                    : 'Switch to stylist'
              }
              block
              disabled={setActiveRole.isPending}
              onPress={switchRole}
            />
          ) : (
            <Button
              label="Set up my stylist page"
              block
              arrow
              onPress={() => {
                close();
                router.push('/provider-setup');
              }}
            />
          )}
          <Button
            label={hasProviderProfile ? 'Not now' : 'Close'}
            variant="ghost"
            block
            onPress={close}
          />
        </View>
      </Sheet>
    </>
  );
}

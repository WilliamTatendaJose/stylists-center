import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { space } from '@sc/tokens';
import { Button, Pressable, Sheet, Text, useTheme } from '@sc/ui';
import { apiFetch } from '../api/client.js';
import { describeError } from '../api/errorMessage.js';
import { useAuthStore } from '../state/useAuthStore.js';

const styles = StyleSheet.create({
  row: { alignItems: 'center', paddingVertical: space.m },
  title: { marginBottom: space.s },
  body: { marginBottom: space.l },
  error: { marginBottom: space.m },
  actions: { gap: space.s },
});

/**
 * Lets someone delete their own account from the app, as the Play Store and
 * App Store require. The server refuses while a booking or order is open and
 * says why; on success the session is cleared and the app returns to sign-in.
 */
export function DeleteAccount() {
  const { colors } = useTheme();
  const signOut = useAuthStore((state) => state.signOut);
  const [open, setOpen] = useState(false);
  const remove = useMutation({
    mutationFn: () => apiFetch<{ ok: true }>('/v1/me', { method: 'DELETE' }),
    onSuccess: () => {
      setOpen(false);
      void signOut();
    },
  });

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Delete account"
        onPress={() => {
          remove.reset();
          setOpen(true);
        }}
        style={styles.row}
      >
        <Text variant="meta" color={colors.neutral700}>
          Delete account
        </Text>
      </Pressable>
      <Sheet open={open} onClose={() => setOpen(false)}>
        <Text variant="cardTitle" style={styles.title}>
          Delete your account?
        </Text>
        <Text variant="body" color="neutral700" style={styles.body}>
          This permanently deletes your profile, photos, sign-in and any coins or earnings left in
          your wallet. Past bookings and orders stay on the other person&apos;s history without your
          name. It can&apos;t be undone.
        </Text>
        {remove.isError ? (
          <Text variant="meta" color="accent700" accessibilityRole="alert" style={styles.error}>
            {describeError(remove.error, "Couldn't delete your account. Try again.")}
          </Text>
        ) : null}
        <View style={styles.actions}>
          <Button
            label={remove.isPending ? 'Deleting…' : 'Delete my account'}
            block
            disabled={remove.isPending}
            onPress={() => remove.mutate()}
          />
          <Button
            label="Keep my account"
            variant="secondary"
            block
            disabled={remove.isPending}
            onPress={() => setOpen(false)}
          />
        </View>
      </Sheet>
    </>
  );
}

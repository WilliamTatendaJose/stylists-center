import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Button, RadioCard, Screen, ScreenHeader, Text } from '@sc/ui';
import { color, space } from '@sc/tokens';
import type { ActiveRole } from '@sc/shared';
import { useSelectAccountType } from '../src/api/hooks/useMe.js';
import { describeError } from '../src/api/errorMessage.js';

const styles = StyleSheet.create({
  intro: { marginBottom: space.xl },
  choices: { gap: space.m },
  footer: { gap: space.s },
});

export default function AccountType() {
  const [accountType, setAccountType] = useState<ActiveRole | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectAccountType = useSelectAccountType();

  return (
    <Screen
      header={<ScreenHeader title="Choose your account" showBack={false} />}
      footer={
        <View style={styles.footer}>
          {error ? (
            <Text variant="meta" color={color.accent700} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          <Button
            label={selectAccountType.isPending ? 'Saving…' : 'Continue'}
            block
            size="lg"
            arrow
            disabled={!accountType || selectAccountType.isPending}
            onPress={() => {
              if (!accountType) return;
              setError(null);
              selectAccountType.mutate(
                { accountType },
                {
                  onSuccess: () => {
                    router.replace(
                      accountType === 'provider' ? '/provider-setup' : '/complete-profile',
                    );
                  },
                  onError: (cause) =>
                    setError(describeError(cause, "Couldn't save your account type.")),
                },
              );
            }}
          />
        </View>
      }
    >
      <Text variant="body" color="neutral700" style={styles.intro}>
        Choose how you want to use Style Center. We&apos;ll take you through the right setup next.
      </Text>
      <View style={styles.choices}>
        <RadioCard
          title="I'm a client"
          description="Book stylists and shop beauty supplies."
          dot
          selected={accountType === 'client'}
          onPress={() => setAccountType('client')}
        />
        <RadioCard
          title="I'm a stylist"
          description="Create your stylist page, list services, and get booked."
          dot
          selected={accountType === 'provider'}
          onPress={() => setAccountType('provider')}
        />
      </View>
    </Screen>
  );
}

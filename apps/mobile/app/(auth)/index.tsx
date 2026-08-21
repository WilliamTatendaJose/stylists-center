import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ArrowUpRight, MapPin, Sparkles } from 'lucide-react-native';
import { Button, Pressable, Text, useTheme } from '@sc/ui';
import { radius, space } from '@sc/tokens';
import { AuthFooter, AuthShell, SecureNote } from '../../src/components/AuthChrome.js';

const styles = StyleSheet.create({
  valueCard: {
    borderRadius: radius.card,
    padding: space.l,
    gap: space.m,
    marginBottom: space.xl,
  },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: space.m },
  valueIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueCopy: { flex: 1 },
  valueTitle: { marginBottom: 2 },
  signInRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4 },
  signInLink: { minHeight: 44, justifyContent: 'center' },
});

export default function AuthWelcome() {
  const { colors } = useTheme();

  return (
    <AuthShell
      title="Find your next favourite look."
      subtitle="Book brilliant local stylists, discover new products, and keep every appointment in one beautiful place."
    >
      <View style={[styles.valueCard, { backgroundColor: colors.surface }]}>
        <View style={styles.valueRow}>
          <View style={[styles.valueIcon, { backgroundColor: colors.bg }]}>
            <Sparkles size={18} color={colors.accent700} strokeWidth={1.8} />
          </View>
          <View style={styles.valueCopy}>
            <Text variant="cardTitle" style={styles.valueTitle}>
              Personal, from the first tap
            </Text>
            <Text variant="meta" color="neutral700">
              Your favourites, bookings, and messages stay together.
            </Text>
          </View>
        </View>
        <View style={styles.valueRow}>
          <View style={[styles.valueIcon, { backgroundColor: colors.bg }]}>
            <MapPin size={18} color={colors.accent700} strokeWidth={1.8} />
          </View>
          <View style={styles.valueCopy}>
            <Text variant="cardTitle" style={styles.valueTitle}>
              Made for your neighbourhood
            </Text>
            <Text variant="meta" color="neutral700">
              Great people and products, close to home.
            </Text>
          </View>
        </View>
      </View>

      <Button
        label="Create an account"
        block
        size="lg"
        arrow
        onPress={() => router.push('/(auth)/sign-up')}
      />
      <AuthFooter>
        <View style={styles.signInRow}>
          <Text variant="body" color="neutral700">
            Already have an account?
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/(auth)/sign-in')}
            style={styles.signInLink}
          >
            <Text variant="bodyStrong" color="accent700">
              Sign in
            </Text>
          </Pressable>
          <ArrowUpRight size={15} color={colors.accent700} strokeWidth={2} />
        </View>
        <SecureNote>Sign in securely with Google or your email.</SecureNote>
      </AuthFooter>
    </AuthShell>
  );
}

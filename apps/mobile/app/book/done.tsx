import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Check } from 'lucide-react-native';
import { color, space } from '@sc/tokens';
import { Screen, Text, RuleList, Button } from '@sc/ui';
import { PROVIDER_CONVERSATION_ID } from '../../src/fixtures/index.js';
import { withBack } from '../../src/navigation/useBack.js';

const styles = StyleSheet.create({
  circle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: color.onAccent.rule,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.l,
  },
  title: { marginBottom: space.s },
  body: { marginBottom: space.xxl },
  footerRow: { flexDirection: 'row', gap: space.s },
  footerButton: { flex: 1 },
});

/** Booked (handoff screen 8, full accent). No header at all — the screen starts straight into content. */
export default function Booked() {
  const { reference, providerId, providerName, serviceName, whenLabel, areaName, paymentLabel } =
    useLocalSearchParams<{
      reference?: string;
      providerId?: string;
      providerName?: string;
      serviceName?: string;
      whenLabel?: string;
      areaName?: string;
      paymentLabel?: string;
    }>();

  const goMessage = () => {
    const threadId = providerId ? (PROVIDER_CONVERSATION_ID[providerId] ?? providerId) : undefined;
    if (!threadId) return;
    router.push(withBack('/chat/[threadId]', { threadId }, '/(tabs)/bookings'));
  };

  const goBookings = () => {
    router.replace('/(tabs)/bookings');
  };

  return (
    <Screen theme="accent">
      <View style={styles.circle}>
        <Check size={32} strokeWidth={2} color={color.onAccent.text} />
      </View>
      <Text variant="hero" color={color.onAccent.text} style={styles.title}>
        Booked.
      </Text>
      <Text variant="body" color={color.onAccent.labelDim} style={styles.body}>
        {providerName ?? 'She'} has your request for {whenLabel ?? 'your slot'}. She confirms within
        the hour.
      </Text>

      <RuleList
        onAccent
        items={[
          { label: 'Reference', value: reference ?? '—' },
          { label: 'Service', value: serviceName ?? '—' },
          { label: 'Payment', value: paymentLabel ?? '—' },
          { label: 'Where', value: areaName ?? '—' },
        ]}
      />

      <View style={styles.footerRow}>
        <Button
          label="Message"
          variant="outlineOnAccent"
          size="lg"
          onPress={goMessage}
          style={styles.footerButton}
        />
        <Button
          label="My bookings"
          variant="whiteOnAccent"
          size="lg"
          onPress={goBookings}
          style={styles.footerButton}
        />
      </View>
    </Screen>
  );
}

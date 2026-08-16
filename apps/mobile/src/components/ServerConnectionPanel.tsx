import { StyleSheet, View } from 'react-native';
import { WifiOff } from 'lucide-react-native';
import { radius, space } from '@sc/tokens';
import { Button, Text, useTheme } from '@sc/ui';
import { ApiError, NetworkError } from '../api/client.js';

const styles = StyleSheet.create({
  panel: { borderWidth: 1, borderRadius: radius.card, padding: space.l },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: space.m },
  icon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0 },
  body: { marginTop: 3 },
  button: { marginTop: space.l },
});

interface ServerConnectionPanelProps {
  error?: unknown;
  onRetry: () => void;
  compact?: boolean;
}

/** A consistent, actionable state for a lost API connection â€” never raw fetch text. */
export function ServerConnectionPanel({
  error,
  onRetry,
  compact = false,
}: ServerConnectionPanelProps) {
  const { colors } = useTheme();
  const unavailable = error instanceof NetworkError;
  const serverProblem = error instanceof ApiError && error.status >= 500;
  const title = unavailable
    ? "Can't reach Stylists Center"
    : serverProblem
      ? 'Our service is taking a moment'
      : 'This information could not be loaded';
  const body = unavailable
    ? compact
      ? 'Showing your last update. Check your connection and try again.'
      : 'Check your Wi-Fi or mobile data, then try again. Your saved information is still safe.'
    : serverProblem
      ? 'Nothing needs fixing on your phone. Please try again in a moment.'
      : 'Please try again. If it keeps happening, return to the previous screen and reopen this one.';

  return (
    <View
      style={[styles.panel, { borderColor: colors.divider, backgroundColor: colors.surface }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <View style={styles.top}>
        <View style={[styles.icon, { backgroundColor: colors.accent100 }]}>
          <WifiOff size={21} strokeWidth={1.8} color={colors.accent700} />
        </View>
        <View style={styles.copy}>
          <Text variant="bodyStrong">{title}</Text>
          <Text variant="meta" color="neutral700" style={styles.body}>
            {body}
          </Text>
        </View>
      </View>
      <Button label="Try again" variant="secondary" block style={styles.button} onPress={onRetry} />
    </View>
  );
}

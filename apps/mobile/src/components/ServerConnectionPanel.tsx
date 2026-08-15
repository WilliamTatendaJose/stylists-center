import { StyleSheet, View } from 'react-native';
import { WifiOff } from 'lucide-react-native';
import { color, radius, space } from '@sc/tokens';
import { Button, Text } from '@sc/ui';
import { ApiError, NetworkError } from '../api/client.js';

const styles = StyleSheet.create({
  panel: { borderWidth: 1, borderColor: color.divider, borderRadius: radius.card, padding: space.l, backgroundColor: color.surface },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: space.m },
  icon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: color.accent100 },
  copy: { flex: 1, minWidth: 0 },
  body: { marginTop: 3 },
  button: { marginTop: space.l },
});

interface ServerConnectionPanelProps { error?: unknown; onRetry: () => void; compact?: boolean; }

/** A consistent, actionable state for a lost API connection — never raw fetch text. */
export function ServerConnectionPanel({ error, onRetry, compact = false }: ServerConnectionPanelProps) {
  const unavailable = error instanceof NetworkError;
  const serverProblem = error instanceof ApiError && error.status >= 500;
  const title = unavailable ? "Can't reach Stylists Center" : serverProblem ? 'Our service is taking a moment' : 'This information could not be loaded';
  const body = unavailable
    ? compact ? 'Showing your last update. Check your connection and try again.' : 'Check your Wi-Fi or mobile data, then try again. Your saved information is still safe.'
    : serverProblem ? 'Nothing needs fixing on your phone. Please try again in a moment.' : 'Please try again. If it keeps happening, return to the previous screen and reopen this one.';

  return (
    <View style={styles.panel} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <View style={styles.top}>
        <View style={styles.icon}><WifiOff size={21} strokeWidth={1.8} color={color.accent700} /></View>
        <View style={styles.copy}>
          <Text variant="bodyStrong">{title}</Text>
          <Text variant="meta" color="neutral700" style={styles.body}>{body}</Text>
        </View>
      </View>
      <Button label="Try again" variant="secondary" block style={styles.button} onPress={onRetry} />
    </View>
  );
}

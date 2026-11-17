import * as Sentry from '@sentry/react-native';
import * as Updates from 'expo-updates';

/**
 * Crash and error reporting (Sentry).
 *
 * Off unless EXPO_PUBLIC_SENTRY_DSN is set, and never on in development.
 * A DSN only lets the app send reports; it is not a secret. No personal
 * details are attached (sendDefaultPii off): a report carries the error, the
 * screen, the phone model and the app/update version.
 *
 * Builds made before the native module was added still run this: the SDK
 * detects the missing native side and reports JavaScript errors only.
 */
const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim();

export const sentryEnabled = !!dsn && !__DEV__;

if (sentryEnabled) {
  Sentry.init({
    dsn,
    environment: Updates.channel ?? 'development',
    // The over-the-air update the phone is running, to tell fixes apart.
    dist: Updates.updateId ?? 'embedded',
    // One session in five is timed, for slow-screen data within the free plan.
    tracesSampleRate: 0.2,
    sendDefaultPii: false,
  });
}

/** Reports an error caught by the app's own error screen. Safe when Sentry is off. */
export function reportError(error: unknown, context: Record<string, string> = {}): void {
  if (!sentryEnabled) return;
  Sentry.captureException(error, { tags: context });
}

/** Ties reports to an account id (no name, phone or email), or clears it on sign-out. */
export function setReportingUser(userId: string | null): void {
  if (!sentryEnabled) return;
  Sentry.setUser(userId ? { id: userId } : null);
}

/** Wraps the root component so Sentry can time screens and catch render errors. */
export function withSentry<P extends Record<string, unknown>>(
  component: React.ComponentType<P>,
): React.ComponentType<P> {
  return sentryEnabled ? Sentry.wrap(component) : component;
}

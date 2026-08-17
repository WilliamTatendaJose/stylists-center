import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { notificationRoute } from './notificationRoute.js';

/**
 * Opens the screen a tapped notification refers to.
 *
 * Two paths, and missing either one is the usual reason "notifications don't
 * work" even when they arrive: `addNotificationResponseReceivedListener` covers
 * a tap while the app is running or backgrounded, and
 * `getLastNotificationResponseAsync` covers the app being launched from cold by
 * the tap — in that case the event fired before any listener could exist, so
 * polling for it once at startup is the only way to see it.
 *
 * Navigation is deliberately best-effort. A notification for a screen this
 * build does not have, or a malformed payload, must leave the user in the app
 * rather than crashing it, so an unroutable payload is simply ignored.
 */
export function useNotificationRouting(isReady: boolean): void {
  useEffect(() => {
    // Waiting for the navigator: routing before it has mounted throws, and a
    // cold start from a notification is exactly when that race happens.
    if (!isReady) return;

    let cancelled = false;

    const go = (data: unknown) => {
      const path = notificationRoute(data);
      if (!path || cancelled) return;
      // Same cast, and the same reason, as useBack.ts: the destination is
      // decided at runtime from a server payload, so typed routes cannot
      // narrow it statically — notificationRoute's own return values are what
      // keep it to real routes. Whether the assertion reads as "necessary"
      // depends on whether Expo Router's generated typed-route union
      // (.expo/types/router.d.ts, gitignored) exists in the environment doing
      // the linting: present locally, absent on a fresh CI checkout, where
      // plain `string` already satisfies the ungenerated, broader `Href`.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      router.push(path as Href);
    };

    void Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) go(response.notification.request.content.data);
      })
      .catch(() => {
        // No launch notification, or the module is unavailable on this
        // platform — neither is a problem worth surfacing.
      });

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      go(response.notification.request.content.data);
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [isReady]);
}

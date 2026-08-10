import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { apiFetch } from '../api/client.js';

Notifications.setNotificationHandler({
  handleNotification: () =>
    Promise.resolve({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
});

function projectIdFromExtra(extra: unknown): string | undefined {
  if (typeof extra !== 'object' || extra === null || !('eas' in extra)) return undefined;
  const eas = extra.eas;
  if (typeof eas !== 'object' || eas === null || !('projectId' in eas)) return undefined;
  return typeof eas.projectId === 'string' ? eas.projectId : undefined;
}

/**
 * Registers a physical device with Expo and tells the API where to send a
 * notification. Permission denial, simulators, and incomplete EAS setup are
 * normal states, so callers can treat this as best-effort.
 */
export async function registerPushToken(): Promise<void> {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return;

  const existing = await Notifications.getPermissionsAsync();
  const permission =
    existing.status === Notifications.PermissionStatus.GRANTED
      ? existing
      : await Notifications.requestPermissionsAsync();
  if (permission.status !== Notifications.PermissionStatus.GRANTED) return;

  const extra: unknown = Constants.expoConfig?.extra;
  const projectId = projectIdFromExtra(extra);
  if (!projectId) return;

  const expoPushToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await apiFetch<void>('/v1/me/push-token', {
    method: 'POST',
    body: { expoPushToken, platform: Platform.OS },
  });
}

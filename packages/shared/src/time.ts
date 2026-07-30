import { formatInTimeZone } from 'date-fns-tz';

/**
 * The one place a Stylists Center timestamp is allowed to become display text.
 *
 * Slot times, "expires in 5 minutes", and every "when" label in the design
 * must never be rendered from the device's locale or local timezone — a
 * client roaming on a different phone timezone would otherwise see a booking
 * slip by two hours. Africa/Harare is UTC+2 with no DST, so this is cheap to
 * get right and easy to get wrong by skipping it.
 *
 * An ESLint rule (`no-restricted-syntax` on `toLocaleString`/`toLocaleDateString`/
 * `toLocaleTimeString` in apps/mobile) exists specifically to force call sites
 * through this function instead.
 */
const HARARE_TIME_ZONE = 'Africa/Harare';

export function formatInHarare(iso: string, formatStr: string): string {
  return formatInTimeZone(new Date(iso), HARARE_TIME_ZONE, formatStr);
}

/** "Today 14:30", "Wed 14:30" — the Bookings-row "when" label. */
export function formatBookingWhen(iso: string, now: Date = new Date()): string {
  const nowLabel = formatInTimeZone(now, HARARE_TIME_ZONE, 'yyyy-MM-dd');
  const dayLabel = formatInTimeZone(new Date(iso), HARARE_TIME_ZONE, 'yyyy-MM-dd');
  const time = formatInHarare(iso, 'HH:mm');
  if (dayLabel === nowLabel) return `Today ${time}`;
  return `${formatInHarare(iso, 'EEE')} ${time}`;
}

import { formatInHarare } from '@sc/shared';

/**
 * `date` ('yyyy-MM-dd') and `time` ('HH:mm') are already Harare-local
 * wall-clock values, chosen via DateStrip/TimeGrid — not a UTC instant. Harare
 * is a fixed UTC+2 with no DST, so attaching that offset explicitly gives a
 * real instant that round-trips correctly back through formatInHarare (the
 * one function allowed to turn a timestamp into display text — see time.ts).
 */
export function isoFromHarareSlot(date: string, time: string): string {
  return new Date(`${date}T${time}:00+02:00`).toISOString();
}

/** "Thu 30 Jul, 16:30" — the slot summary/payment/booked "When" value. */
export function formatSlotLabel(date: string, time: string): string {
  return formatInHarare(isoFromHarareSlot(date, time), 'EEE d MMM, HH:mm');
}

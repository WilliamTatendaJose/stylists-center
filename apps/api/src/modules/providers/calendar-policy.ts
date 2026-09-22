import { weeklyHoursSchema, type WeeklyInterval } from '@sc/shared';

/** Legacy profiles retain the published booking window until their owner saves a calendar. */
export const LEGACY_WEEKLY_HOURS: WeeklyInterval[] = Array.from({ length: 7 }, (_, dayOfWeek) => ({
  dayOfWeek,
  opensAt: '07:00',
  closesAt: '20:00',
}));

export function readWeeklyHours(value: unknown): WeeklyInterval[] {
  if (value === null || value === undefined) return LEGACY_WEEKLY_HOURS;
  const parsed = weeklyHoursSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

function harareParts(date: Date): { dayOfWeek: number; date: string; time: string } {
  const local = new Date(date.getTime() + 2 * 60 * 60_000);
  return {
    dayOfWeek: local.getUTCDay(),
    date: local.toISOString().slice(0, 10),
    time: local.toISOString().slice(11, 16),
  };
}

export function isWithinWeeklyHours(
  intervals: WeeklyInterval[],
  startsAt: Date,
  endsAt: Date,
): boolean {
  if (startsAt >= endsAt) return false;
  const start = harareParts(startsAt);
  const end = harareParts(endsAt);
  if (start.date !== end.date) return false;
  return intervals.some(
    (interval) =>
      interval.dayOfWeek === start.dayOfWeek &&
      interval.opensAt <= start.time &&
      interval.closesAt >= end.time,
  );
}

export function overlapsTimeOff(
  timeOff: { startsAt: Date; endsAt: Date }[],
  startsAt: Date,
  endsAt: Date,
): boolean {
  return timeOff.some((block) => block.startsAt < endsAt && block.endsAt > startsAt);
}

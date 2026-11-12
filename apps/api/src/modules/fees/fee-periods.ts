/**
 * Fee statements follow the business's calendar: months in Africa/Harare,
 * which is UTC+2 all year (no daylight saving), so a month boundary is a
 * fixed two-hour offset from UTC midnight.
 */
const HARARE_OFFSET_MS = 2 * 60 * 60_000;
export const DAY_MS = 24 * 60 * 60_000;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** The Harare calendar month an instant falls in, as 'YYYY-MM'. */
export function harareMonthKey(at: Date): string {
  const local = new Date(at.getTime() + HARARE_OFFSET_MS);
  return `${String(local.getUTCFullYear())}-${pad(local.getUTCMonth() + 1)}`;
}

function parseKey(key: string): { year: number; month: number } {
  const [year, month] = key.split('-').map(Number) as [number, number];
  return { year, month };
}

/** The instant a Harare month begins (00:00 on the 1st, Harare time). */
export function harareMonthStart(key: string): Date {
  const { year, month } = parseKey(key);
  return new Date(Date.UTC(year, month - 1, 1) - HARARE_OFFSET_MS);
}

export function nextMonthKey(key: string): string {
  const { year, month } = parseKey(key);
  return month === 12 ? `${String(year + 1)}-01` : `${String(year)}-${pad(month + 1)}`;
}

/**
 * When a month's statement falls due: `dueDay` of the following month, from
 * the start of that day. The due day is capped at 28 by its setting, so it
 * exists in every month.
 */
export function statementDueAt(key: string, dueDay: number): Date {
  const { year, month } = parseKey(nextMonthKey(key));
  return new Date(Date.UTC(year, month - 1, dueDay) - HARARE_OFFSET_MS);
}

/** 00:00 today in Harare. */
export function harareDayStart(at: Date): Date {
  const local = at.getTime() + HARARE_OFFSET_MS;
  return new Date(local - (local % DAY_MS) - HARARE_OFFSET_MS);
}

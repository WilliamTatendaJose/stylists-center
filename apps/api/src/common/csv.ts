import { BadRequestException } from '@nestjs/common';

/**
 * A spreadsheet treats a cell starting with = + - @ (or tab/CR) as a formula,
 * so a stylist named `=HYPERLINK(...)` could run something on the finance
 * team's machine when the export is opened (OWASP "CSV injection"). Such
 * cells are prefixed with a single quote, which shows the text literally.
 * Plain negative numbers are left alone: they're our own data, not input.
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return String(value);
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const BOM = '\uFEFF';

/** CRLF line endings and a UTF-8 BOM: without the BOM, Excel reads the file as a legacy encoding and garbles any non-ASCII name. */
export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(csvCell).join(','));
  return `${BOM}${lines.join('\r\n')}\r\n`;
}

/** Dollars from integer cents, always two decimals, as a number cell. */
export function usd(cents: number): number {
  return Math.round(cents) / 100;
}

const HARARE_OFFSET_MS = 2 * 60 * 60_000; // Africa/Harare is UTC+2 all year (no DST)
const MAX_RANGE_DAYS = 366;

/**
 * `from`/`to` as YYYY-MM-DD, both inclusive, in Harare local days: the
 * business's calendar, so "October" means what the finance team expects.
 * Returns [start, endExclusive] instants.
 */
export function harareDateRange(from?: string, to?: string): { start: Date; end: Date } {
  const parse = (value: string | undefined, name: string): number => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException(`${name} must be a date like 2026-10-01`);
    }
    const [y, m, d] = value.split('-').map(Number) as [number, number, number];
    const utc = Date.UTC(y, m - 1, d);
    if (new Date(utc).getUTCDate() !== d)
      throw new BadRequestException(`${name} isn't a real date`);
    return utc - HARARE_OFFSET_MS;
  };
  const start = parse(from, 'from');
  const end = parse(to, 'to') + 24 * 60 * 60_000;
  if (end <= start) throw new BadRequestException('to must be on or after from');
  if (end - start > MAX_RANGE_DAYS * 24 * 60 * 60_000) {
    throw new BadRequestException(`Export at most ${String(MAX_RANGE_DAYS)} days at a time`);
  }
  return { start: new Date(start), end: new Date(end) };
}

/** An ISO timestamp shown in Harare time, e.g. 2026-10-01 14:05 — what a spreadsheet user expects to read. */
export function harareTime(date: Date): string {
  return new Date(date.getTime() + HARARE_OFFSET_MS).toISOString().slice(0, 16).replace('T', ' ');
}

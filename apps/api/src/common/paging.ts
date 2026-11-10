import type { Paged } from '@sc/shared';

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

export interface PageRequest {
  limit: number;
  offset: number;
}

function parseNonNegative(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/** Reads `?limit=&offset=` defensively: junk falls back to the defaults, and limit is capped. */
export function readPage(limit?: string, offset?: string): PageRequest {
  return {
    limit: Math.min(Math.max(parseNonNegative(limit, DEFAULT_PAGE_SIZE), 1), MAX_PAGE_SIZE),
    offset: parseNonNegative(offset, 0),
  };
}

export function toPage<T>(items: T[], total: number, page: PageRequest): Paged<T> {
  return { items, total, limit: page.limit, offset: page.offset };
}

/** For lists that can only be computed in memory: page an already-filtered, sorted array. */
export function pageArray<T>(all: T[], page: PageRequest): Paged<T> {
  return toPage(all.slice(page.offset, page.offset + page.limit), all.length, page);
}

/** Trimmed search text, or undefined when there's nothing to search for. */
export function searchTerm(q?: string): string | undefined {
  const trimmed = q?.trim();
  return trimmed ? trimmed.slice(0, 100) : undefined;
}

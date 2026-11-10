/** Page size for every paged admin list (the API caps limit at 200). */
export const PAGE_SIZE = 50;

export interface ListParams {
  q?: string | undefined;
  offset?: number | undefined;
}

/** Builds `?a=1&b=2`, skipping empty values, always with limit/offset. */
export function listQuery(params: object): string {
  const search = new URLSearchParams({ limit: String(PAGE_SIZE) });
  for (const [key, value] of Object.entries(params) as [string, unknown][]) {
    if (value === undefined || value === null || value === '') continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      search.set(key, String(value));
    }
  }
  return `?${search.toString()}`;
}

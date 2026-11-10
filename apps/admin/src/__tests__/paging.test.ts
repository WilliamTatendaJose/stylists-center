import { describe, expect, it } from 'vitest';
import { listQuery, PAGE_SIZE } from '../api/paging';

describe('listQuery', () => {
  it('always sends the page size', () => {
    expect(listQuery({})).toBe(`?limit=${String(PAGE_SIZE)}`);
  });

  it('includes set values and skips empty ones', () => {
    const query = new URLSearchParams(
      listQuery({ q: 'tari', offset: 50, verified: false, status: undefined, empty: '' }).slice(1),
    );
    expect(Object.fromEntries(query)).toEqual({
      limit: String(PAGE_SIZE),
      q: 'tari',
      offset: '50',
      verified: 'false',
    });
  });

  it('encodes search text safely', () => {
    expect(listQuery({ q: '+263 77&x=1' })).toContain('q=%2B263+77%26x%3D1');
  });
});

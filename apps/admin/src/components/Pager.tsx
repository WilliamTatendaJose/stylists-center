import { useEffect, useState } from 'react';
import { PAGE_SIZE } from '../api/paging';
import { Button } from './ui/Button';

/** "51–100 of 240" with Previous / Next. Renders nothing for a single short page. */
export function Pager({
  offset,
  shown,
  total,
  onChange,
}: {
  offset: number;
  shown: number;
  total: number;
  onChange: (offset: number) => void;
}) {
  if (total <= PAGE_SIZE && offset === 0) return null;
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + shown, total);
  return (
    <div className="mt-4 flex items-center justify-between gap-3 text-sm text-neutral-600 dark:text-dark-muted">
      <span>
        {from}–{to} of {total}
      </span>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          disabled={offset === 0}
          onClick={() => {
            onChange(Math.max(0, offset - PAGE_SIZE));
          }}
        >
          Previous
        </Button>
        <Button
          variant="secondary"
          disabled={offset + PAGE_SIZE >= total}
          onClick={() => {
            onChange(offset + PAGE_SIZE);
          }}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

/** Search input that reports its value 300 ms after typing stops. */
export function SearchBox({
  placeholder,
  onSearch,
}: {
  placeholder: string;
  onSearch: (q: string) => void;
}) {
  const [value, setValue] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => {
      onSearch(value.trim());
    }, 300);
    return () => {
      clearTimeout(timer);
    };
    // onSearch is a state setter from the parent; re-running on its identity
    // would only re-fire the same search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      type="search"
      aria-label={placeholder}
      placeholder={placeholder}
      value={value}
      onChange={(e) => {
        setValue(e.target.value);
      }}
      className="w-full max-w-xs rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-accent focus:outline-none dark:border-dark-border dark:bg-white/5 dark:text-dark-text"
    />
  );
}

import { useEffect, useState } from 'react';

/**
 * Delays a fast-changing value so it can be used as a query key.
 *
 * Typing "braiding" is eight renders; without this each one is a request, and
 * on a metered connection that is eight times the data for one answer. 300 ms
 * is the usual sweet spot — long enough to swallow a normal typing cadence,
 * short enough that the results feel like they respond to the keystroke.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value);
    }, delayMs);
    return () => {
      clearTimeout(timer);
    };
  }, [value, delayMs]);

  return debounced;
}

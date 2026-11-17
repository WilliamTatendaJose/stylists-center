import { useEffect, useRef } from 'react';
import { useIsFocused } from 'expo-router';

/**
 * Poll interval for a query that belongs to one screen: `intervalMs` while the
 * screen is the one being looked at, `false` (no polling) otherwise.
 *
 * Tab screens stay mounted when the user switches tab, and react-query only
 * pauses polling for a backgrounded app, not for a screen that is covered. A
 * 30 s poll on each of four tabs is four times the requests (and mobile data)
 * of the one the user can actually see.
 */
export function pollInterval(focused: boolean, intervalMs: number): number | false {
  return focused ? intervalMs : false;
}

/**
 * Whether coming back to a screen should fetch straight away. Polling paused
 * while it was hidden, so without this the user would look at old data for up
 * to a full interval after switching back. Data younger than `maxAgeMs` is
 * fresh enough and is left alone.
 */
export function shouldRefetchOnRefocus(input: {
  focused: boolean;
  wasFocused: boolean;
  dataUpdatedAt: number;
  now: number;
  maxAgeMs: number;
}): boolean {
  return input.focused && !input.wasFocused && input.now - input.dataUpdatedAt >= input.maxAgeMs;
}

/**
 * Focus-aware polling for one query:
 *
 *   const poll = useFocusPolling(30_000);
 *   const query = useQuery({ ..., refetchInterval: poll.refetchInterval });
 *   useRefetchOnRefocus(poll, query);
 */
export function useFocusPolling(intervalMs: number) {
  const focused = useIsFocused();
  return { focused, intervalMs, refetchInterval: pollInterval(focused, intervalMs) };
}

export function useRefetchOnRefocus(
  poll: { focused: boolean; intervalMs: number },
  query: { dataUpdatedAt: number; refetch: () => unknown },
): void {
  const wasFocused = useRef(poll.focused);
  const latest = useRef(query);
  latest.current = query;
  const { focused, intervalMs } = poll;

  useEffect(() => {
    if (
      shouldRefetchOnRefocus({
        focused,
        wasFocused: wasFocused.current,
        dataUpdatedAt: latest.current.dataUpdatedAt,
        now: Date.now(),
        maxAgeMs: intervalMs,
      })
    ) {
      void latest.current.refetch();
    }
    wasFocused.current = focused;
  }, [focused, intervalMs]);
}

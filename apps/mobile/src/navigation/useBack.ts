import { useCallback } from 'react';
import { router, useLocalSearchParams, type Href } from 'expo-router';

/**
 * "Every screen records where back goes" (handoff, Client state table). Three
 * tiers, in priority order:
 *
 *  1. An explicit `back` search param wins — set by the caller when the same
 *     screen is reachable from more than one place and the default stack pop
 *     would be wrong (e.g. Provider profile reached from Home, Map search, or
 *     an accepted offer all need a different "back").
 *  2. A normal stack pop, when there is a stack to pop.
 *  3. A hard fallback (usually Home), for cold-start / deep-link entry where
 *     there is no stack at all.
 *
 * Deliberately per-navigation, not a single global "back" — a global value
 * would be wrong on Android hardware back when the same screen has multiple
 * legitimate entry points.
 */
export function useBack(fallback: Href) {
  const { back } = useLocalSearchParams<{ back?: string }>();

  return useCallback(() => {
    if (back) {
      router.replace(back);
      return;
    }
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(fallback);
  }, [back, fallback]);
}

/**
 * Appends a `back` param to a Href's params so the destination screen's
 * useBack() resolves to `explicitBack` instead of a plain stack pop. Use this
 * at every call site where a screen is pushed from a non-default entry point.
 */
export function withBack<P extends Record<string, unknown>>(
  pathname: string,
  params: P,
  explicitBack: Href,
): { pathname: string; params: P & { back: string } } {
  return {
    pathname,
    params: { ...params, back: hrefToString(explicitBack) },
  };
}

function hrefToString(href: Href): string {
  return typeof href === 'string' ? href : (href.pathname ?? '/');
}

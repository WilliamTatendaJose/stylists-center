/**
 * Every mock hook awaits this before resolving, so screens exercise real
 * loading states (spinners, skeletons) now instead of everything looking
 * instant until Phase 3 swaps fixtures for HTTP and loading suddenly appears
 * for the first time.
 */
export function mockDelay<T>(value: T, ms = 350): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}
